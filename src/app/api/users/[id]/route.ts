import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { timeEntries, users, tags } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { canManageTeams, getAccessibleTeamIds, getUserTeams, isAdmin, isTeamLead, replaceUserTeamMemberships } from "@/lib/permissions";
import { broadcastDataChange } from "@/lib/realtime";
import { findTeamMemberPageIdByEmail, updateTeamMemberName, updateTeamMemberTimeCommitment } from "@/lib/notion";

const updateSchema = z.object({
  role: z.enum(["admin", "team_lead", "member"]).optional(),
  name: z.string().min(1).optional(),
  teamId: z.string().uuid().nullable().optional(),
  teamIds: z.array(z.string().uuid()).optional(),
  isActive: z.boolean().optional(),
  weeklyTargetHours: z.number().min(0).max(168).optional(),
  discordWebhookUrl: z.string().url().nullable().optional(),
  notifyOnStart: z.boolean().optional(),
  notifyOnStop: z.boolean().optional(),
  dailySummary: z.boolean().optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userIsAdmin = isAdmin(session.user);
  const userIsTeamLead = isTeamLead(session.user);

  if (!userIsAdmin && !userIsTeamLead) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!db) return NextResponse.json({ error: "DB not available" }, { status: 503 });

  const { id } = await params;
  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const [existingUser] = await db
    .select({ id: users.id, role: users.role, teamId: users.teamId, name: users.name, notionTeamMemberId: users.notionTeamMemberId })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);

  if (!existingUser) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (userIsTeamLead && !userIsAdmin) {
    const accessibleTeamIds = await getAccessibleTeamIds(session.user);
    const existingTeams = await getUserTeams(existingUser.id);
    const overlap = existingTeams.some((team) => accessibleTeamIds?.includes(team.id));
    if (!overlap && existingUser.id !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const allowedKeys = ["weeklyTargetHours"];
    const attemptedKeys = Object.keys(parsed.data).filter(
      (k) => parsed.data[k as keyof typeof parsed.data] !== undefined
    );
    const forbidden = attemptedKeys.filter((k) => !allowedKeys.includes(k));
    if (forbidden.length > 0) {
      return NextResponse.json({ error: "Team leads can only update weekly target hours." }, { status: 403 });
    }
  }

  const finalRole = parsed.data.role ?? existingUser.role;
  const requestedTeamIds = parsed.data.teamIds ?? (parsed.data.teamId !== undefined ? (parsed.data.teamId ? [parsed.data.teamId] : []) : undefined);
  const existingTeams = await getUserTeams(existingUser.id);
  const finalTeamIds = requestedTeamIds ?? existingTeams.map((team) => team.id);

  if (finalRole !== "admin" && finalTeamIds.length === 0) {
    return NextResponse.json(
      { error: "Team leads and members must belong to at least one team." },
      { status: 400 }
    );
  }

  const updateData: Record<string, unknown> = {};
  if (parsed.data.role !== undefined) updateData.role = parsed.data.role;
  if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
  if (parsed.data.teamId !== undefined) updateData.teamId = parsed.data.teamId;
  if (requestedTeamIds !== undefined) updateData.teamId = requestedTeamIds[0] ?? null;
  if (parsed.data.isActive !== undefined) updateData.isActive = parsed.data.isActive;
  if (parsed.data.discordWebhookUrl !== undefined) updateData.discordWebhookUrl = parsed.data.discordWebhookUrl;
  if (parsed.data.notifyOnStart !== undefined) updateData.notifyOnStart = parsed.data.notifyOnStart;
  if (parsed.data.notifyOnStop !== undefined) updateData.notifyOnStop = parsed.data.notifyOnStop;
  if (parsed.data.dailySummary !== undefined) updateData.dailySummary = parsed.data.dailySummary;
  if (parsed.data.weeklyTargetHours !== undefined) updateData.weeklyTargetHours = parsed.data.weeklyTargetHours;

  const [user] = await db
    .update(users)
    .set(updateData)
    .where(eq(users.id, id))
    .returning({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      teamId: users.teamId,
      isActive: users.isActive,
      weeklyTargetHours: users.weeklyTargetHours,
      discordWebhookUrl: users.discordWebhookUrl,
      notifyOnStart: users.notifyOnStart,
      notifyOnStop: users.notifyOnStop,
      dailySummary: users.dailySummary,
      createdAt: users.createdAt,
    });

  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const notionTeamMemberId = existingUser.notionTeamMemberId || await findTeamMemberPageIdByEmail(user.email).catch(() => null);

  if (parsed.data.name !== undefined && parsed.data.name.trim() !== existingUser.name) {
    if (notionTeamMemberId) {
      await updateTeamMemberName(notionTeamMemberId, parsed.data.name.trim()).catch(() => {});
    }
  }

  if (parsed.data.weeklyTargetHours !== undefined && notionTeamMemberId) {
    await updateTeamMemberTimeCommitment(notionTeamMemberId, parsed.data.weeklyTargetHours);
  }

  if (requestedTeamIds !== undefined) {
    await replaceUserTeamMemberships(id, requestedTeamIds);
  }
  const userTeams = await getUserTeams(id);
  broadcastDataChange("team");
  return NextResponse.json({ user: { ...user, teams: userTeams, team: userTeams[0] ?? null } });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || !canManageTeams(session.user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!db) return NextResponse.json({ error: "DB not available" }, { status: 503 });

  const { id } = await params;
  if (id === session.user.id) {
    return NextResponse.json({ error: "Cannot delete your own account" }, { status: 400 });
  }

  const [existingUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);

  if (!existingUser) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [entry] = await db
    .select({ id: timeEntries.id })
    .from(timeEntries)
    .where(eq(timeEntries.userId, id))
    .limit(1);

  if (entry) {
    return NextResponse.json(
      { error: "This member has time entries and cannot be deleted. Deactivate the account instead." },
      { status: 409 }
    );
  }

  await db.delete(tags).where(eq(tags.userId, id));
  await db.delete(users).where(eq(users.id, id));
  broadcastDataChange("team");
  return NextResponse.json({ ok: true });
}
