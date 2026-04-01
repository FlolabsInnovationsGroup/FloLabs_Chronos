import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { invitationTeamMemberships, invitations, teamMemberships, users } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { normalizeEmail } from "@/lib/invitations";

const registerSchema = z.object({
  token: z.string().min(1),
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
});

export async function POST(req: Request) {
  if (!db) return NextResponse.json({ error: "Database not available" }, { status: 503 });

  const body = await req.json();
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const { token, name, email, password } = parsed.data;
  const normalizedEmail = normalizeEmail(email);

  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, normalizedEmail)).limit(1);
  if (existing.length > 0) return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });

  const [invite] = await db.select().from(invitations).where(and(eq(invitations.token, token), eq(invitations.email, normalizedEmail))).limit(1);
  if (!invite) return NextResponse.json({ error: "This invitation is invalid." }, { status: 404 });
  if (invite.acceptedAt) return NextResponse.json({ error: "This invitation has already been used." }, { status: 410 });
  if (new Date(invite.expiresAt).getTime() < Date.now()) return NextResponse.json({ error: "This invitation has expired." }, { status: 410 });

  const inviteTeams = await db.select({ teamId: invitationTeamMemberships.teamId }).from(invitationTeamMemberships).where(eq(invitationTeamMemberships.invitationId, invite.id));
  const teamIds = inviteTeams.map((row) => row.teamId);
  if (invite.role !== "admin" && teamIds.length === 0 && !invite.teamId) {
    return NextResponse.json({ error: "This invitation is missing a team assignment." }, { status: 400 });
  }

  const hashedPassword = await bcrypt.hash(password, 12);
  const [user] = await db.insert(users).values({
    name: name.trim(),
    email: normalizedEmail,
    password: hashedPassword,
    role: invite.role,
    teamId: teamIds[0] ?? invite.teamId,
    isActive: true,
  }).returning({ id: users.id, email: users.email, name: users.name, role: users.role, teamId: users.teamId, isActive: users.isActive });

  const effectiveTeamIds = teamIds.length > 0 ? teamIds : (invite.teamId ? [invite.teamId] : []);
  if (effectiveTeamIds.length > 0) {
    await db.insert(teamMemberships).values(effectiveTeamIds.map((teamId) => ({ userId: user.id, teamId }))).onConflictDoNothing();
  }

  await db.update(invitations).set({ acceptedAt: new Date() }).where(eq(invitations.id, invite.id));
  return NextResponse.json({ user }, { status: 201 });
}
