import { eq } from "drizzle-orm";
import type { Role } from "@/types";
import { db } from "@/lib/db";
import { teams, users } from "@/lib/db/schema";

export interface SessionUserLike {
  id: string;
  role: Role;
  teamId: string | null;
  isActive: boolean;
}

export function isAdmin(user?: Pick<SessionUserLike, "role"> | null): boolean {
  return user?.role === "admin";
}

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

export async function getAccessibleUserIds(user: SessionUserLike): Promise<string[] | null> {
  if (isAdmin(user)) {
    return null;
  }

  if (!db) {
    return [user.id];
  }

  if (isTeamLead(user) && user.teamId) {
    const rows = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.teamId, user.teamId));
    return rows.map((row) => row.id);
  }

  return [user.id];
}

export async function canAccessUser(user: SessionUserLike, targetUserId: string): Promise<boolean> {
  const accessibleIds = await getAccessibleUserIds(user);
  return accessibleIds === null ? true : accessibleIds.includes(targetUserId);
}

export async function getAccessibleUsers(user: SessionUserLike) {
  if (!db) {
    return [];
  }

  if (isAdmin(user)) {
    return db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        teamId: users.teamId,
        isActive: users.isActive,
        discordWebhookUrl: users.discordWebhookUrl,
        notifyOnStart: users.notifyOnStart,
        notifyOnStop: users.notifyOnStop,
        dailySummary: users.dailySummary,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
        team: { id: teams.id, name: teams.name, slug: teams.slug },
      })
      .from(users)
      .leftJoin(teams, eq(users.teamId, teams.id));
  }

  if (user.teamId) {
    return db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        teamId: users.teamId,
        isActive: users.isActive,
        discordWebhookUrl: users.discordWebhookUrl,
        notifyOnStart: users.notifyOnStart,
        notifyOnStop: users.notifyOnStop,
        dailySummary: users.dailySummary,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
        team: { id: teams.id, name: teams.name, slug: teams.slug },
      })
      .from(users)
      .leftJoin(teams, eq(users.teamId, teams.id))
      .where(eq(users.teamId, user.teamId));
  }

  return db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      teamId: users.teamId,
      isActive: users.isActive,
      discordWebhookUrl: users.discordWebhookUrl,
      notifyOnStart: users.notifyOnStart,
      notifyOnStop: users.notifyOnStop,
      dailySummary: users.dailySummary,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
      team: { id: teams.id, name: teams.name, slug: teams.slug },
    })
    .from(users)
    .leftJoin(teams, eq(users.teamId, teams.id))
    .where(eq(users.id, user.id));
}

export async function getAccessibleTeams(user: SessionUserLike) {
  if (!db) {
    return [];
  }

  if (isAdmin(user)) {
    return db.select().from(teams).orderBy(teams.name);
  }

  if (!user.teamId) {
    return [];
  }

  return db.select().from(teams).where(eq(teams.id, user.teamId));
}
