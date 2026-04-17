import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getAccessibleUsers } from "@/lib/permissions";
import { getAllActiveTimers } from "@/lib/redis";
import { db } from "@/lib/db";
import { applicants, projects, timeEntries, users as usersTable } from "@/lib/db/schema";
import { and, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import type { ActiveTimer, ApplicantProgramStatus } from "@/types";

/** Pipeline stage in `applicants.stage` for team members who should appear on the Users page. */
const JOINED_PIPELINE_STAGE = "joined";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let rows: Awaited<ReturnType<typeof getAccessibleUsers>> = [];
    try {
      rows = await getAccessibleUsers(session.user);
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

    // Users page: Chronos users linked from applicant rows with pipeline stage "joined" (Hephaestus),
    // excluding applicant program status "terminated". Status "graduated" still lists here.
    let programStatusByUserId = new Map<string, ApplicantProgramStatus>();
    if (db && rows.length > 0) {
      try {
        const joinedApplicantRows = await db
          .select({ chronosUserId: applicants.chronosUserId, status: applicants.status })
          .from(applicants)
          .where(
            and(
              isNotNull(applicants.chronosUserId),
              sql`lower(coalesce(${applicants.status}, '')) <> 'terminated'`,
              or(
                sql`lower(${applicants.stage}) = ${JOINED_PIPELINE_STAGE}`,
                sql`lower(coalesce(${applicants.status}, '')) = 'joined'`,
              ),
            ),
          );
        const joinedUserIds = new Set<string>();
        for (const r of joinedApplicantRows) {
          if (!r.chronosUserId) continue;
          joinedUserIds.add(r.chronosUserId);
          const s = (r.status ?? "active").toLowerCase();
          /* Legacy `status = joined` marks pipeline position; badge only uses active | graduated | terminated. */
          const normalized: ApplicantProgramStatus =
            s === "graduated" || s === "terminated" ? s : "active";
          if (!programStatusByUserId.has(r.chronosUserId)) {
            programStatusByUserId.set(r.chronosUserId, normalized);
          }
        }
        rows = rows.filter((u) => joinedUserIds.has(u.id));
      } catch (err) {
        console.error("[api/users] filtering to joined applicants failed", err);
        rows = [];
        programStatusByUserId = new Map();
      }
    }

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

    const users = rows.map((user) => {
      const activeTimer = activeTimers[user.id];

      return {
        ...user,
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

    return NextResponse.json({ users });
  } catch (error) {
    console.error("[api/users GET] fatal", error);
    // Return 200 so authenticated clients using `readJson` do not surface a hard "Users service unavailable"
    // banner for a recoverable empty state; operators still see the warning in the payload.
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
    { error: "Direct user creation is disabled. Use invitations instead." },
    { status: 405 }
  );
}
