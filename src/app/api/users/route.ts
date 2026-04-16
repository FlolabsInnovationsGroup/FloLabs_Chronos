import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getAccessibleUsers } from "@/lib/permissions";
import { getAllActiveTimers } from "@/lib/redis";
import { db } from "@/lib/db";
import { applicants, projects, timeEntries, users as usersTable } from "@/lib/db/schema";
import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import type { ActiveTimer } from "@/types";

/** Applicants with this `applicants.status` and a linked `chronos_user_id` are shown on the Users page. */
const JOINED_APPLICANT_STATUS = "joined" as const;

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

    // Users page: only Chronos users linked from applicant rows with status "joined".
    if (db && rows.length > 0) {
      try {
        const joinedApplicantRows = await db
          .select({ chronosUserId: applicants.chronosUserId })
          .from(applicants)
          .where(and(eq(applicants.status, JOINED_APPLICANT_STATUS), isNotNull(applicants.chronosUserId)));
        const joinedUserIds = new Set(
          joinedApplicantRows.map((r) => r.chronosUserId).filter((id): id is string => Boolean(id)),
        );
        rows = rows.filter((u) => joinedUserIds.has(u.id));
      } catch (err) {
        console.error("[api/users] filtering to joined applicants failed", err);
        rows = [];
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
