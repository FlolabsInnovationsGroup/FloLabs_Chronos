import { eq, inArray, isNotNull } from "drizzle-orm";
import type { Role, Team } from "@/types";
import { db } from "@/lib/db";
import { teamMemberships, teams, users } from "@/lib/db/schema";
import { isAdminLikeRole } from "@/lib/role-utils";
import { resolveChronosUserIdForSessionUser } from "@/lib/chronos-session";
import { listFlolabsUsersInHephaestusJoinedDirectory } from "@/lib/hephaestus-directory-query";

export interface SessionUserLike {
  /** Canonical applicant id (leads pipeline). */
  id: string;
  /** Chronos `users.id` for FKs, timers, tags, and team_memberships. */
  chronosUserId?: string | null;
  role: Role;
  teamId: string | null;
  isActive: boolean;
}

/** Map session identity to Chronos user rows (`users.id`). */
export function sessionOwnershipUserId(user: SessionUserLike): string {
  const linked = user.chronosUserId;
  if (typeof linked === "string" && linked.length > 0) return linked;
  return user.id;
}

async function resolveSessionOwnershipUserId(user: SessionUserLike): Promise<string> {
  const linked = await resolveChronosUserIdForSessionUser(user as unknown as Parameters<typeof resolveChronosUserIdForSessionUser>[0]);
  return linked ?? sessionOwnershipUserId(user);
}

export function isAdmin(user?: Pick<SessionUserLike, "role"> | null): boolean {
  return isAdminLikeRole(user?.role);
}

export { isAdminLikeRole } from "@/lib/role-utils";

export function isTeamLead(user?: Pick<SessionUserLike, "role"> | null): boolean {
  return user?.role === "team_lead";
}

export function isMember(user?: Pick<SessionUserLike, "role"> | null): boolean {
  return user?.role === "member";
}

export function canManageProjects(user?: Pick<SessionUserLike, "role"> | null): boolean {
  return isAdmin(user);
}

export function canManageTeams(user?: Pick<SessionUserLike, "role"> | null): boolean {
  return isAdmin(user);
}

export function canManageInvitations(user?: Pick<SessionUserLike, "role"> | null): boolean {
  return isAdmin(user);
}

export function canViewTeamDirectory(user?: SessionUserLike | null): boolean {
  return Boolean(user);
}

export async function getAccessibleTeamIds(user: SessionUserLike): Promise<string[] | null> {
  if (isAdmin(user)) return null;
  if (!db) return user.teamId ? [user.teamId] : [];

  const ownerId = await resolveSessionOwnershipUserId(user);
  const rows = await db
    .select({ teamId: teamMemberships.teamId })
    .from(teamMemberships)
    .where(eq(teamMemberships.userId, ownerId));

  if (rows.length > 0) {
    return rows.map((row) => row.teamId);
  }

  return user.teamId ? [user.teamId] : [];
}

export async function getAccessibleUserIds(user: SessionUserLike): Promise<string[] | null> {
  if (isAdmin(user)) return null;
  const ownerId = await resolveSessionOwnershipUserId(user);
  if (!db) return [ownerId];
  if (isMember(user)) return [ownerId];

  const teamIds = await getAccessibleTeamIds(user);
  if (!teamIds || teamIds.length === 0) return [ownerId];

  const rows = await db
    .selectDistinct({ id: teamMemberships.userId })
    .from(teamMemberships)
    .where(inArray(teamMemberships.teamId, teamIds));

  const ids = new Set(rows.map((row) => row.id));

  // Include Chronos users assigned to those teams via `users.team_id`.
  const applicantRows = await db
    .selectDistinct({ id: users.id })
    .from(users)
    .where(inArray(users.teamId, teamIds));
  for (const row of applicantRows) {
    if (row.id) ids.add(row.id);
  }

  return ids.size > 0 ? [...ids] : [ownerId];
}

export async function canAccessUser(user: SessionUserLike, targetUserId: string): Promise<boolean> {
  const accessibleIds = await getAccessibleUserIds(user);
  return accessibleIds === null ? true : accessibleIds.includes(targetUserId);
}

/** Admins, entry owners, and team leads (for teammates in scope) may edit/delete time entries. */
export async function canManageTimeEntry(user: SessionUserLike, entryOwnerUserId: string): Promise<boolean> {
  if (isAdmin(user)) return true;
  const ownerId = await resolveSessionOwnershipUserId(user);
  if (ownerId === entryOwnerUserId) return true;
  if (isTeamLead(user)) return canAccessUser(user, entryOwnerUserId);
  return false;
}

export async function getAccessibleUsers(user: SessionUserLike) {
  if (!db) return [];

  const accessibleUserIds = await getAccessibleUserIds(user);
  const baseUsers =
    accessibleUserIds === null
      ? await listFlolabsUsersInHephaestusJoinedDirectory()
      : accessibleUserIds.length === 0
        ? []
        : await db.select().from(users).where(inArray(users.id, accessibleUserIds));

  if (baseUsers.length === 0) return [];

  let membershipRows: Array<{
    userId: string;
    team: { id: string; name: string; slug: string; isActive: boolean };
  }> = [];
  try {
    membershipRows = await db
      .select({
        userId: teamMemberships.userId,
        team: {
          id: teams.id,
          name: teams.name,
          slug: teams.slug,
          isActive: teams.isActive,
        },
      })
      .from(teamMemberships)
      .innerJoin(teams, eq(teamMemberships.teamId, teams.id))
      .where(inArray(teamMemberships.userId, baseUsers.map((u) => u.id)));
  } catch (error) {
    // Large `inArray` payloads or transient DB errors must not hide the entire directory.
    console.error("[permissions] team membership hydrate failed; returning users without teams", error);
  }

  const teamsByUser = new Map<string, Team[]>();
  for (const row of membershipRows) {
    const list = teamsByUser.get(row.userId) ?? [];
    list.push(row.team as Team);
    teamsByUser.set(row.userId, list);
  }

  return baseUsers.map((u) => {
    const userTeams = teamsByUser.get(u.id) ?? [];
    return {
      ...u,
      teams: userTeams,
      team: userTeams[0] ?? (u.teamId ? { id: u.teamId, name: "", slug: "" } : null),
    };
  });
}

export async function getAccessibleTeams(user: SessionUserLike) {
  if (!db) return [];
  if (isAdmin(user)) {
    return db
      .select({
        id: teams.id,
        name: teams.name,
        slug: teams.slug,
        isActive: teams.isActive,
        notionPageId: teams.notionPageId,
      })
      .from(teams)
      .where(isNotNull(teams.notionPageId))
      .orderBy(teams.name);
  }

  const teamIds = await getAccessibleTeamIds(user);
  if (!teamIds || teamIds.length === 0) return [];
  return db
    .select({
      id: teams.id,
      name: teams.name,
      slug: teams.slug,
      isActive: teams.isActive,
      notionPageId: teams.notionPageId,
    })
    .from(teams)
    .where(inArray(teams.id, teamIds))
    .orderBy(teams.name);
}

/** Admins and team leads can discuss entries of OTHER users they can see. Not own entries. */
export async function canStartDiscussion(viewer: SessionUserLike, entryOwnerUserId: string): Promise<boolean> {
  if (sessionOwnershipUserId(viewer) === entryOwnerUserId) return false;
  if (isAdmin(viewer)) return true;
  if (isTeamLead(viewer)) return canAccessUser(viewer, entryOwnerUserId);
  return false;
}

/** True when the viewer is the discussion starter (Chronos user and/or linked applicant). */
export function discussionStarterMatchesViewer(
  viewer: SessionUserLike,
  discussion: { startedById: string; startedByApplicantId?: string | null }
): boolean {
  if (sessionOwnershipUserId(viewer) === discussion.startedById) return true;
  if (
    typeof viewer.chronosUserId === "string" &&
    viewer.chronosUserId.length > 0 &&
    discussion.startedByApplicantId &&
    viewer.id === discussion.startedByApplicantId
  ) {
    return true;
  }
  return false;
}

/** Admins can resolve any discussion. Discussion starter can resolve their own. */
export function canResolveDiscussion(
  viewer: SessionUserLike,
  discussion: { startedById: string; startedByApplicantId?: string | null }
): boolean {
  if (isAdmin(viewer)) return true;
  return discussionStarterMatchesViewer(viewer, discussion);
}

/** Who can view discussions on an entry */
export async function canViewDiscussions(viewer: SessionUserLike, entryOwnerUserId: string): Promise<boolean> {
  if (isAdmin(viewer)) return true;
  if (isTeamLead(viewer)) return canAccessUser(viewer, entryOwnerUserId);
  return (await resolveSessionOwnershipUserId(viewer)) === entryOwnerUserId;
}

export async function replaceUserTeamMemberships(userId: string, teamIds: string[]) {
  if (!db) return;
  await db.delete(teamMemberships).where(eq(teamMemberships.userId, userId));
  if (teamIds.length > 0) {
    await db.insert(teamMemberships).values(teamIds.map((teamId) => ({ userId, teamId }))).onConflictDoNothing();
  }
}

export async function getUserTeams(userId: string) {
  if (!db) return [];
  const rows = await db
    .select({
      id: teams.id,
      name: teams.name,
      slug: teams.slug,
      isActive: teams.isActive,
    })
    .from(teamMemberships)
    .innerJoin(teams, eq(teamMemberships.teamId, teams.id))
    .where(eq(teamMemberships.userId, userId));
  return rows as Team[];
}
