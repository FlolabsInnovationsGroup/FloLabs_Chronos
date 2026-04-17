import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getAccessibleUsers } from "@/lib/permissions";
import { getAllActiveTimers } from "@/lib/redis";
import { db } from "@/lib/db";
import { applicants, projects, timeEntries, userEmailAliases, users as usersTable } from "@/lib/db/schema";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { ActiveTimer, ApplicantProgramStatus } from "@/types";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { isAdminLikeRole } from "@/lib/role-utils";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    /** Admin/HR directory: JWT role can diverge from `users.role` during migrations — honor both. */
    let effectiveElevated = isAdminLikeRole(session.user.role);
    if (db) {
      const [sessionDbUser] = await db
        .select({ role: usersTable.role })
        .from(usersTable)
        .where(eq(usersTable.id, session.user.id))
        .limit(1);
      effectiveElevated = isAdminLikeRole(sessionDbUser?.role) || isAdminLikeRole(session.user.role);
    }

    let rows: Awaited<ReturnType<typeof getAccessibleUsers>> = [];
    if (db) {
      // Ensure applicants with Joined/Active status have linked Chronos users.
      // Multi-pass + bounded batches so more rows link per request without timing out.
      const joinedWhere = sql`lower(coalesce(${applicants.stage}, '')) = 'joined' or lower(coalesce(${applicants.status}, '')) in ('signed', 'joined', 'active')`;
      const generatedPasswordHash = await bcrypt.hash(randomBytes(24).toString("hex"), 12);
      const PROVISION_PER_PASS = 250;
      const MAX_PASSES = 3;
      for (let pass = 0; pass < MAX_PASSES; pass++) {
        const joinedApplicants = await db
          .select({
            id: applicants.id,
            email: applicants.email,
            name: applicants.name,
            chronosUserId: applicants.chronosUserId,
          })
          .from(applicants)
          .where(joinedWhere);
        const missingJoinedApplicants = joinedApplicants.filter((a) => !a.chronosUserId).slice(0, PROVISION_PER_PASS);
        if (missingJoinedApplicants.length === 0) break;
        for (const applicant of missingJoinedApplicants) {
          try {
            if (applicant.chronosUserId) continue;
            const normalizedApplicantEmail = applicant.email?.trim().toLowerCase();
            if (!normalizedApplicantEmail) {
              continue;
            }
            const [existingUser] = await db
              .select({ id: usersTable.id, role: usersTable.role })
              .from(usersTable)
              .where(sql`lower(${usersTable.email}) = ${normalizedApplicantEmail}`)
              .limit(1);
            let userId = existingUser?.id ?? null;
            if (!userId) {
              try {
                userId = (
                  await db
                    .insert(usersTable)
                    .values({
                      email: normalizedApplicantEmail,
                      name: applicant.name?.trim() || normalizedApplicantEmail,
                      password: generatedPasswordHash,
                      role: "member",
                      isActive: true,
                    })
                    .returning({ id: usersTable.id })
                )[0]?.id ?? null;
              } catch {
                const [retryUser] = await db
                  .select({ id: usersTable.id })
                  .from(usersTable)
                  .where(sql`lower(${usersTable.email}) = ${normalizedApplicantEmail}`)
                  .limit(1);
                userId = retryUser?.id ?? null;
              }
            }
            if (!userId) continue;
            try {
              await db
                .update(applicants)
                .set({ chronosUserId: userId, isActive: true, updatedAt: new Date() })
                .where(sql`${applicants.id} = ${applicant.id}`);
            } catch {
              await db
                .update(applicants)
                .set({ chronosUserId: userId, updatedAt: new Date() })
                .where(sql`${applicants.id} = ${applicant.id}`);
            }
          } catch (error) {
            console.error("[api/users] joined applicant auto-provision skipped", {
              applicantId: applicant.id,
              error,
            });
            continue;
          }
        }
      }
    }
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
    let programStatusByUserId = new Map<string, ApplicantProgramStatus>();
    const applicantProfileByUserId = new Map<
      string,
      {
        role: string | null;
        teamId: string | null;
        isActive: boolean;
        weeklyTargetHours: number | null;
        profilePictureUrl: string | null;
        notionTeamMemberId: string | null;
        name: string | null;
        email: string | null;
        hubspotRawData: unknown;
      }
    >();

  const activeTimers: Record<string, ActiveTimer> = await getAllActiveTimers().catch(() => ({}));
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

    const applicantCounts = new Map<string, number>();
    if (db && session.user.role === 'admin') {
      try {
        const applicantRows = await db.select({ chronosUserId: applicants.chronosUserId }).from(applicants);
        for (const row of applicantRows) {
          if (!row.chronosUserId) continue;
          applicantCounts.set(row.chronosUserId, (applicantCounts.get(row.chronosUserId) ?? 0) + 1);
        }
      } catch (error) {
        console.error("[api/users] applicants count query failed", error);
      }
    }

    let aliasRows: Array<{ userId: string; email: string }> = [];
    if (db && rows.length > 0) {
      try {
        aliasRows = await db
          .select({ userId: userEmailAliases.userId, email: userEmailAliases.email })
          .from(userEmailAliases)
          .where(inArray(userEmailAliases.userId, rows.map((r) => r.id)));
      } catch {
        aliasRows = [];
      }
    }
    const aliasesByUserId = new Map<string, string[]>();
    for (const row of aliasRows) {
      const list = aliasesByUserId.get(row.userId) ?? [];
      list.push(row.email);
      aliasesByUserId.set(row.userId, list);
    }

    const users = rows.map((user) => {
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
        notionTeamMemberId: profile?.notionTeamMemberId ?? user.notionTeamMemberId,
        requiresNotionProfileLink: !(profile?.notionTeamMemberId ?? user.notionTeamMemberId),
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
        applicantProgramStatus: programStatusByUserId.get(user.id) ?? null,
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
