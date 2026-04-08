import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { teamMemberships, teams, users, projects, timeEntries } from "@/lib/db/schema";
import { eq, inArray, isNull, and } from "drizzle-orm";
import { getAccessibleTeamIds, isAdmin } from "@/lib/permissions";
import { getAllActiveTimers } from "@/lib/redis";
import type { ActiveTimer } from "@/types";

/**
 * GET /api/teams/[id]/members
 *
 * Returns the members of a team. Any authenticated user can call this for
 * teams they belong to. Admins can call it for any team.
 *
 * Members receive the same member list as team leads / admins (name, role,
 * status, live indicator) but the Teams page UI controls whether per-member
 * detail cards are shown — members are blocked at the UI layer.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!db) return NextResponse.json({ members: [] });

  const { id: teamId } = await params;

  // Verify the requesting user has access to this team.
  if (!isAdmin(session.user)) {
    const accessibleTeamIds = await getAccessibleTeamIds(session.user);
    // getAccessibleTeamIds returns the user's own team memberships for any role.
    if (!accessibleTeamIds || !accessibleTeamIds.includes(teamId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  // Verify the team exists.
  const [team] = await db
    .select({ id: teams.id })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);
  if (!team) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Fetch all members of this team.
  const memberRows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      isActive: users.isActive,
      weeklyTargetHours: users.weeklyTargetHours,
      createdAt: users.createdAt,
    })
    .from(teamMemberships)
    .innerJoin(users, eq(teamMemberships.userId, users.id))
    .where(eq(teamMemberships.teamId, teamId));

  if (memberRows.length === 0) return NextResponse.json({ members: [] });

  // Attach active timer info (live indicator) from Redis.
  const activeTimers: Record<string, ActiveTimer> = await getAllActiveTimers().catch(() => ({}));
  const memberUserIds = memberRows.map((m) => m.id);

  // Resolve project names for running timers where the name isn't in Redis yet.
  const activeUserIds = memberUserIds.filter((uid) => !!activeTimers[uid]);
  const runningProjectIdByUser = new Map<string, string>();
  if (activeUserIds.length > 0) {
    const runningRows = await db
      .select({ userId: timeEntries.userId, projectId: timeEntries.projectId })
      .from(timeEntries)
      .where(and(isNull(timeEntries.stoppedAt), inArray(timeEntries.userId, activeUserIds)));
    for (const row of runningRows) {
      if (row.projectId) runningProjectIdByUser.set(row.userId, row.projectId);
    }
  }

  const projectIdSet = new Set<string>();
  for (const timer of Object.values(activeTimers)) {
    if (typeof timer.projectId === "string") projectIdSet.add(timer.projectId);
  }
  for (const pid of runningProjectIdByUser.values()) projectIdSet.add(pid);

  const projectNameById = new Map<string, string>();
  if (projectIdSet.size > 0) {
    const projectRows = await db
      .select({ id: projects.id, name: projects.name })
      .from(projects)
      .where(inArray(projects.id, [...projectIdSet]));
    for (const p of projectRows) projectNameById.set(p.id, p.name);
  }

  const members = memberRows.map((m) => {
    const timer = activeTimers[m.id];
    const effectiveProjectId = timer?.projectId ?? runningProjectIdByUser.get(m.id) ?? null;
    const projectName =
      (typeof timer?.projectName === "string" ? timer.projectName : null) ??
      (effectiveProjectId ? (projectNameById.get(effectiveProjectId) ?? null) : null);

    return {
      ...m,
      activeTimer: timer
        ? {
            startedAt: timer.startedAt,
            description: timer.description,
            projectId: effectiveProjectId,
            projectName,
          }
        : null,
    };
  });

  return NextResponse.json({ members });
}
