import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getAccessibleUsers } from "@/lib/permissions";
import { getAllActiveTimers } from "@/lib/redis";
import { db } from "@/lib/db";
import { applicants, projects, timeEntries } from "@/lib/db/schema";
import { and, inArray, isNull } from "drizzle-orm";
import type { ActiveTimer } from "@/types";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await getAccessibleUsers(session.user);
  const activeTimers: Record<string, ActiveTimer> = await getAllActiveTimers().catch(() => ({}));
  const activeUserIds = Object.keys(activeTimers);

  /** Running Postgres row may still have project_id when Redis timer predates projectName or projectId sync. */
  const runningProjectIdByUser = new Map<string, string>();
  if (db && activeUserIds.length > 0) {
    const runningRows = await db
      .select({ userId: timeEntries.userId, projectId: timeEntries.projectId })
      .from(timeEntries)
      .where(and(isNull(timeEntries.stoppedAt), inArray(timeEntries.userId, activeUserIds)));
    for (const row of runningRows) {
      if (row.projectId) {
        runningProjectIdByUser.set(row.userId, row.projectId);
      }
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
    const activeProjectRows = await db
      .select({ id: projects.id, name: projects.name })
      .from(projects)
      .where(inArray(projects.id, uniqueProjectIds));
    for (const project of activeProjectRows) {
      activeProjectNameById.set(project.id, project.name);
    }
  }

  const applicantCounts = new Map<string, number>();
  if (db && session.user.role === 'admin') {
    const applicantRows = await db.select({ chronosUserId: applicants.chronosUserId }).from(applicants);
    for (const row of applicantRows) {
      if (!row.chronosUserId) continue;
      applicantCounts.set(row.chronosUserId, (applicantCounts.get(row.chronosUserId) ?? 0) + 1);
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
}

export async function POST() {
  return NextResponse.json(
    { error: "Direct user creation is disabled. Use invitations instead." },
    { status: 405 }
  );
}
