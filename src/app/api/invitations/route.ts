import { NextResponse } from "next/server";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { invitations, teams, users } from "@/lib/db/schema";
import { buildInviteUrl, createInvitationToken, normalizeEmail } from "@/lib/invitations";
import { canManageInvitations } from "@/lib/permissions";

const createInvitationSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  role: z.enum(["team_lead", "member"]).default("member"),
  teamId: z.string().uuid(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user || !canManageInvitations(session.user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!db) {
    return NextResponse.json({ invitations: [] });
  }

  const rows = await db
    .select({
      id: invitations.id,
      email: invitations.email,
      name: invitations.name,
      role: invitations.role,
      teamId: invitations.teamId,
      token: invitations.token,
      invitedById: invitations.invitedById,
      expiresAt: invitations.expiresAt,
      acceptedAt: invitations.acceptedAt,
      createdAt: invitations.createdAt,
      team: { id: teams.id, name: teams.name, slug: teams.slug },
    })
    .from(invitations)
    .leftJoin(teams, eq(invitations.teamId, teams.id))
    .orderBy(desc(invitations.createdAt));

  return NextResponse.json({
    invitations: rows.map((invite) => ({
      ...invite,
      inviteUrl: buildInviteUrl(invite.token),
    })),
  });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user || !canManageInvitations(session.user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!db) {
    return NextResponse.json({ error: "DB not available" }, { status: 503 });
  }

  const body = await req.json();
  const parsed = createInvitationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const normalizedEmail = normalizeEmail(parsed.data.email);

  const [team] = await db
    .select({ id: teams.id, name: teams.name, slug: teams.slug })
    .from(teams)
    .where(eq(teams.id, parsed.data.teamId))
    .limit(1);

  if (!team) {
    return NextResponse.json({ error: "Selected team does not exist." }, { status: 404 });
  }

  const [existingUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);

  if (existingUser) {
    return NextResponse.json({ error: "This email already has an account." }, { status: 409 });
  }

  const [existingInvite] = await db
    .select({
      id: invitations.id,
      token: invitations.token,
      expiresAt: invitations.expiresAt,
    })
    .from(invitations)
    .where(and(eq(invitations.email, normalizedEmail), isNull(invitations.acceptedAt)))
    .orderBy(desc(invitations.createdAt))
    .limit(1);

  if (existingInvite && new Date(existingInvite.expiresAt).getTime() > Date.now()) {
    return NextResponse.json(
      {
        error: "A pending invitation already exists for this email.",
        inviteUrl: buildInviteUrl(existingInvite.token, req.url),
      },
      { status: 409 }
    );
  }

  const token = createInvitationToken();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  const [invite] = await db
    .insert(invitations)
    .values({
      email: normalizedEmail,
      name: parsed.data.name.trim(),
      role: parsed.data.role,
      teamId: parsed.data.teamId,
      token,
      invitedById: session.user.id,
      expiresAt,
    })
    .returning({
      id: invitations.id,
      email: invitations.email,
      name: invitations.name,
      role: invitations.role,
      teamId: invitations.teamId,
      token: invitations.token,
      invitedById: invitations.invitedById,
      expiresAt: invitations.expiresAt,
      acceptedAt: invitations.acceptedAt,
      createdAt: invitations.createdAt,
    });

  return NextResponse.json(
    {
      invitation: invite,
      inviteUrl: buildInviteUrl(token, req.url),
      delivery: "manual",
    },
    { status: 201 }
  );
}
