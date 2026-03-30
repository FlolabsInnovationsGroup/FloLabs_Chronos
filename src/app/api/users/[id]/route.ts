import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { timeEntries, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { canManageTeams } from "@/lib/permissions";

const updateSchema = z.object({
  role: z.enum(["admin", "team_lead", "member"]).optional(),
  name: z.string().min(1).optional(),
  teamId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().optional(),
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
  if (!session?.user || !canManageTeams(session.user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!db) return NextResponse.json({ error: "DB not available" }, { status: 503 });

  const { id } = await params;
  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const [existingUser] = await db
    .select({ id: users.id, role: users.role, teamId: users.teamId })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);

  if (!existingUser) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const finalRole = parsed.data.role ?? existingUser.role;
  const finalTeamId =
    parsed.data.teamId !== undefined ? parsed.data.teamId : existingUser.teamId;

  if (finalRole !== "admin" && !finalTeamId) {
    return NextResponse.json(
      { error: "Team leads and members must belong to a team." },
      { status: 400 }
    );
  }

  const updateData: Record<string, unknown> = {};
  if (parsed.data.role !== undefined) updateData.role = parsed.data.role;
  if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
  if (parsed.data.teamId !== undefined) updateData.teamId = parsed.data.teamId;
  if (parsed.data.isActive !== undefined) updateData.isActive = parsed.data.isActive;
  if (parsed.data.discordWebhookUrl !== undefined) updateData.discordWebhookUrl = parsed.data.discordWebhookUrl;
  if (parsed.data.notifyOnStart !== undefined) updateData.notifyOnStart = parsed.data.notifyOnStart;
  if (parsed.data.notifyOnStop !== undefined) updateData.notifyOnStop = parsed.data.notifyOnStop;
  if (parsed.data.dailySummary !== undefined) updateData.dailySummary = parsed.data.dailySummary;

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
      discordWebhookUrl: users.discordWebhookUrl,
      notifyOnStart: users.notifyOnStart,
      notifyOnStop: users.notifyOnStop,
      dailySummary: users.dailySummary,
      createdAt: users.createdAt,
    });

  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ user });
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

  await db.delete(users).where(eq(users.id, id));
  return NextResponse.json({ ok: true });
}
