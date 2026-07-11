import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { invitationTeamMemberships, invitations, teamMemberships, users } from "@/lib/db/schema";
import { ensureDiscordResourcesForUser } from "@/lib/discord-provisioning";
import { normalizeEmail } from "@/lib/invitations";
import { addPrimaryEmailAlias, findUserByAnyEmail } from "@/lib/user-email-aliases";

const registerSchema = z.object({
  token: z.string().min(1),
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
});

function splitDisplayName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const firstName = parts[0] ?? name.trim();
  const lastName = parts.length > 1 ? parts.slice(1).join(" ") : firstName;
  return { firstName, lastName };
}

export async function POST(req: Request) {
  if (!db) return NextResponse.json({ error: "Database not available" }, { status: 503 });

  const body = await req.json();
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const { token, name, email, password } = parsed.data;
  const normalizedEmail = normalizeEmail(email);

  const existing = await findUserByAnyEmail(normalizedEmail);
  if (existing) {
    return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
  }

  const [invite] = await db
    .select()
    .from(invitations)
    .where(and(eq(invitations.token, token), eq(invitations.email, normalizedEmail)))
    .limit(1);
  if (!invite) return NextResponse.json({ error: "This invitation is invalid." }, { status: 404 });
  if (invite.acceptedAt) {
    return NextResponse.json({ error: "This invitation has already been used." }, { status: 410 });
  }
  if (new Date(invite.expiresAt).getTime() < Date.now()) {
    return NextResponse.json({ error: "This invitation has expired." }, { status: 410 });
  }

  const inviteTeams = await db
    .select({ teamId: invitationTeamMemberships.teamId })
    .from(invitationTeamMemberships)
    .where(eq(invitationTeamMemberships.invitationId, invite.id));
  const teamIds = inviteTeams.map((row) => row.teamId);
  if (invite.role !== "admin" && teamIds.length === 0 && !invite.teamId) {
    return NextResponse.json({ error: "This invitation is missing a team assignment." }, { status: 400 });
  }

  const trimmedName = name.trim();
  const { firstName, lastName } = splitDisplayName(trimmedName);
  const hashedPassword = await bcrypt.hash(password, 12);
  const effectiveTeamIds = teamIds.length > 0 ? teamIds : invite.teamId ? [invite.teamId] : [];

  const [user] = await db
    .insert(users)
    .values({
      name: trimmedName,
      firstName,
      lastName,
      email: normalizedEmail,
      password: hashedPassword,
      role: invite.role,
      teamId: effectiveTeamIds[0] ?? invite.teamId,
      isActive: true,
      status: "joined",
      stage: "joined",
      source: "chronos_invite",
      joinedAt: new Date(),
      weeklyTargetHours: 40,
      notionTeamMemberId: invite.notionTeamMemberId ?? null,
    })
    .returning({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      teamId: users.teamId,
      isActive: users.isActive,
      notionTeamMemberId: users.notionTeamMemberId,
    });

  if (effectiveTeamIds.length > 0) {
    await db
      .insert(teamMemberships)
      .values(effectiveTeamIds.map((teamId) => ({ userId: user.id, teamId })))
      .onConflictDoNothing();
  }

  await db.update(invitations).set({ acceptedAt: new Date() }).where(eq(invitations.id, invite.id));

  await addPrimaryEmailAlias(user.id, user.email).catch(() => null);
  await ensureDiscordResourcesForUser({ userId: user.id, name: user.name }).catch(() => null);

  return NextResponse.json({ user }, { status: 201 });
}
