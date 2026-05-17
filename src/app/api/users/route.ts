import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getAccessibleUsers } from "@/lib/permissions";
import { getActiveTimersForUserIds } from "@/lib/redis";
import { db } from "@/lib/db";
import { projects, timeEntries, userEmailAliases, users as usersTable } from "@/lib/db/schema";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { normalizeApplicantStatus, userVisibleOnChronosDirectory } from "@/lib/applicant-status";
import type { ActiveTimer, ApplicantStatus } from "@/types";
import { isAdminLikeRole } from "@/lib/role-utils";
import { effectiveNotionTeamMemberId } from "@/lib/notion-team-member-link";
import { ensureNotionTeamMemberLinksRepaired } from "@/lib/repair-notion-team-member-links-runtime";
import { getMergedDuplicateApplicantIds } from "@/lib/duplicate-review";

async function withTimeout<T>(label: string, promise: Promise<T>, fallback: T, timeoutMs = 1500): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise.catch((error) => {
        console.error(`[api/users] ${label} failed`, error);
        return fallback;
      }),
      new Promise<T>((resolve) => {
        timeout = setTimeout(() => {
          console.warn(`[api/users] ${label} timed out after ${timeoutMs}ms; continuing without it`);
          resolve(fallback);
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    /** Admin/HR directory: JWT role can diverge from `users.role` during migrations — honor both. */
    let effectiveElevated = isAdminLikeRole(session.user.role);
    if (db && session.user.chronosUserId) {
      const [sessionDbUser] = await db
        .select({ role: usersTable.role })
        .from(usersTable)
        .where(eq(usersTable.id, session.user.chronosUserId))
        .limit(1);
      effectiveElevated = isAdminLikeRole(sessionDbUser?.role) || isAdminLikeRole(session.user.role);
    }
    if (db && effectiveElevated) {
      await ensureNotionTeamMemberLinksRepaired().catch(() => null);
    }

    let rows: Awaited<ReturnType<typeof getAccessibleUsers>> = [];
    try {
      if (db) {
        if (effectiveElevated) {
          rows = await getAccessibleUsers({ ...session.user, role: "admin" });
        } else {
          rows = await getAccessibleUsers(session.user);
        }
      } else {
        rows = await getAccessibleUsers(session.user);
      }
    } catch (error) {
      // Production safety net: if memberships/team joins fail, still return base users.
      console.error("[api/users] getAccessibleUsers failed, falling back to base users query", error);
      if (db) {
        try {
          rows = (await db.select().from(usersTable)) as Awaited<ReturnType<typeof getAccessibleUsers>>;
        } catch (fallbackErr) {
          console.error("[api/users] base users fallback failed", fallbackErr);
          rows = [];
        }
      }
    }

    if (db && rows.length === 0 && effectiveElevated) {
      try {
        rows = (await db.select().from(usersTable)) as Awaited<ReturnType<typeof getAccessibleUsers>>;
        console.warn("[api/users] elevated user had empty accessible list; using full users table fallback");
      } catch (e) {
        console.error("[api/users] full users fallback for elevated user failed", e);
      }
    }

    // Users page overlay: keep this best-effort only. If shared-applicant enrichment fails in
    // production, the base users directory must still render instead of crashing the page.
    let applicantStatusByUserId = new Map<string, ApplicantStatus>();
    const applicantProfileByUserId = new Map<
      string,
      {
        role: string | null;
        teamId: string | null;
        isActive: boolean;
        weeklyTargetHours: number | null;
        profilePictureUrl: string | null;
        notionTeamMemberId: string | null;
        notionTeamMemberPageUrl: string | null;
        name: string | null;
        email: string | null;
        hubspotRawData: unknown;
      }
    >();

  const userIds = rows.map((r) => r.id);

  // Run Redis + all independent DB lookups in parallel after we have the user list
  const [
    activeTimers,
    rawApplicantRows,
    rawApplicantCounts,
    aliasRows,
    mergedDuplicateIds,
  ] = await Promise.all([
    withTimeout("active timer lookup", getActiveTimersForUserIds(userIds), {}),
    db && rows.length > 0
      ? db
          .select({
            chronosUserId: usersTable.id,
            status: usersTable.status,
            role: usersTable.role,
            teamId: usersTable.teamId,
            isActive: usersTable.isActive,
            weeklyTargetHours: usersTable.weeklyTargetHours,
            profilePictureUrl: usersTable.profilePictureUrl,
            notionTeamMemberId: usersTable.notionTeamMemberId,
            notionTeamMemberPageUrl: usersTable.notionTeamMemberPageUrl,
            name: usersTable.name,
            email: usersTable.email,
            hubspotRawData: usersTable.hubspotRawData,
          })
          .from(usersTable)
          .where(inArray(usersTable.id, userIds))
          .catch((e) => { console.error("[api/users] applicant profile overlay query failed", e); return []; })
      : Promise.resolve([]),
    db && session.user.role === "admin" && rows.length > 0
      ? db
          .select({
            chronosUserId: usersTable.id,
            count: sql<number>`count(*)::int`,
          })
          .from(usersTable)
          .where(inArray(usersTable.id, userIds))
          .groupBy(usersTable.id)
          .catch((e) => { console.error("[api/users] applicants count query failed", e); return []; })
      : Promise.resolve([]),
    db && rows.length > 0
      ? db
          .select({ userId: userEmailAliases.userId, email: userEmailAliases.email })
          .from(userEmailAliases)
          .where(inArray(userEmailAliases.userId, userIds))
          .catch(() => [] as Array<{ userId: string; email: string }>)
      : Promise.resolve([] as Array<{ userId: string; email: string }>),
    withTimeout("merged duplicate lookup", getMergedDuplicateApplicantIds(), new Set<string>()),
  ]);

  for (const row of rawApplicantRows) {
    if (!row.chronosUserId) continue;
    const normalized = normalizeApplicantStatus(row.status);
    if (normalized) applicantStatusByUserId.set(row.chronosUserId, normalized);
    applicantProfileByUserId.set(row.chronosUserId, {
      role: row.role,
      teamId: row.teamId,
      isActive: row.isActive,
      weeklyTargetHours: row.weeklyTargetHours,
      profilePictureUrl: row.profilePictureUrl,
      notionTeamMemberId: row.notionTeamMemberId,
      notionTeamMemberPageUrl: row.notionTeamMemberPageUrl,
      name: row.name,
      email: row.email,
      hubspotRawData: row.hubspotRawData,
    });
  }

  const applicantCounts = new Map<string, number>();
  for (const row of rawApplicantCounts) {
    if (!row.chronosUserId) continue;
    applicantCounts.set(row.chronosUserId, row.count);
  }

  const aliasesByUserId = new Map<string, string[]>();
  for (const row of aliasRows) {
    const list = aliasesByUserId.get(row.userId) ?? [];
    list.push(row.email);
    aliasesByUserId.set(row.userId, list);
  }

  const activeUserIds = Object.keys(activeTimers);

  /** Running Postgres row may still have project_id when Redis timer predates projectName or projectId sync. */
  const runningProjectIdByUser = new Map<string, string>();
  if (db && activeUserIds.length > 0) {
    try {
      const runningRows = await db
        .select({ userId: timeEntries.userId, projectId: timeEntries.projectId })
        .from(timeEntries)
        .where(and(isNull(timeEntries.stoppedAt), inArray(timeEntries.userId, activeUserIds)));
      for (const row of runningRows) {
        if (row.projectId) {
          runningProjectIdByUser.set(row.userId, row.projectId);
        }
      }
    } catch (error) {
      console.error("[api/users] running entries query failed", error);
    }
  }

  const projectIdSet = new Set<string>();
  for (const timer of Object.values(activeTimers)) {
    if (typeof timer.projectId === "string" && timer.projectId.length > 0) {
      projectIdSet.add(timer.projectId);
    }
  }
  for (const pid of runningProjectIdByUser.values()) {
    if (pid) projectIdSet.add(pid);
  }
  const uniqueProjectIds = [...projectIdSet];

  const activeProjectNameById = new Map<string, string>();
  if (db && uniqueProjectIds.length > 0) {
    try {
      const activeProjectRows = await db
        .select({ id: projects.id, name: projects.name })
        .from(projects)
        .where(inArray(projects.id, uniqueProjectIds));
      for (const project of activeProjectRows) {
        activeProjectNameById.set(project.id, project.name);
      }
    } catch (error) {
      console.error("[api/users] active projects lookup failed", error);
    }
  }

    const allUsers = rows.map((user) => {
      const activeTimer = activeTimers[user.id];
      const profile = applicantProfileByUserId.get(user.id);

      return {
        ...user,
        name: profile?.name?.trim() || user.name,
        email: profile?.email?.trim() || user.email,
        role: (profile?.role as typeof user.role | undefined) ?? user.role,
        teamId: profile?.teamId ?? user.teamId,
        isActive: profile?.isActive ?? user.isActive,
        weeklyTargetHours: profile?.weeklyTargetHours ?? user.weeklyTargetHours,
        profilePictureUrl: profile?.profilePictureUrl ?? user.profilePictureUrl,
        notionTeamMemberId: effectiveNotionTeamMemberId({
          notionTeamMemberId: profile?.notionTeamMemberId ?? user.notionTeamMemberId,
          notionTeamMemberPageUrl: profile?.notionTeamMemberPageUrl ?? user.notionTeamMemberPageUrl,
        }),
        requiresNotionProfileLink: !effectiveNotionTeamMemberId({
          notionTeamMemberId: profile?.notionTeamMemberId ?? user.notionTeamMemberId,
          notionTeamMemberPageUrl: profile?.notionTeamMemberPageUrl ?? user.notionTeamMemberPageUrl,
        }),
        alternateEmails: Array.from(
          new Set([
            ...(aliasesByUserId.get(user.id) ?? []),
            ...(Array.isArray((profile as { hubspotRawData?: { emails?: unknown } } | undefined)?.hubspotRawData?.emails)
              ? (((profile as { hubspotRawData?: { emails?: unknown[] } }).hubspotRawData?.emails ?? []) as unknown[])
                  .map((v) => String(v).trim().toLowerCase())
                  .filter(Boolean)
              : []),
          ]),
        ),
        applicantStatus: applicantStatusByUserId.get(user.id) ?? normalizeApplicantStatus((user as { status?: string | null }).status) ?? null,
        applicantCount: applicantCounts.get(user.id) ?? 0,
        activeTimer: activeTimer
          ? (() => {
              const effectiveProjectId =
                activeTimer.projectId ?? runningProjectIdByUser.get(user.id) ?? null;
              const projectName =
                (typeof activeTimer.projectName === "string" ? activeTimer.projectName : null) ??
                (effectiveProjectId ? (activeProjectNameById.get(effectiveProjectId) ?? null) : null);
              return {
                startedAt: activeTimer.startedAt,
                description: activeTimer.description,
                projectId: effectiveProjectId,
                projectName,
                notionTaskPageId: activeTimer.notionTaskPageId ?? null,
                notionTaskTitle: activeTimer.notionTaskTitle ?? null,
              };
            })()
          : null,
      };
    });

    const users = allUsers.filter((user) =>
      userVisibleOnChronosDirectory({
        status: user.applicantStatus,
        role: user.role,
        email: user.email,
        notionTeamMemberId: user.notionTeamMemberId,
        isMergedDuplicate: mergedDuplicateIds.has(user.id),
      }),
    );

    console.info("[api/users] response", {
      requesterRole: session.user.role,
      effectiveElevated,
      usersCount: users.length,
      sampleNames: users.slice(0, 25).map((u) => u.name),
      warning: null,
    });
    return NextResponse.json({ users });
  } catch (error) {
    console.error("[api/users GET] fatal", error);
    // Return 200 so authenticated clients using `readJson` do not surface a hard "Users service unavailable"
    // banner for a recoverable empty state; operators still see the warning in the payload.
    console.info("[api/users] response", {
      usersCount: 0,
      warning: "Users data could not be loaded. Try refreshing in a moment or contact support if this persists.",
    });
    return NextResponse.json(
      {
        users: [],
        warning: "Users data could not be loaded. Try refreshing in a moment or contact support if this persists.",
      },
      { status: 200 },
    );
  }
}

export async function POST() {
  return NextResponse.json(
    { error: "Direct user creation is disabled. Provision users through FloLabs / Hephaestus or your internal process." },
    { status: 405 }
  );
}
