import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { invitationTeamMemberships, invitations, teams } from "@/lib/db/schema";
import { findUserByAnyEmail } from "@/lib/user-email-aliases";

export async function GET(req: Request) {
  if (!db) return NextResponse.json({ error: "Database not available" }, { status: 503 });

  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "Missing invitation token." }, { status: 400 });

  const [invite] = await db
    .select({
      id: invitations.id,
      email: invitations.email,
      name: invitations.name,
      role: invitations.role,
      teamId: invitations.teamId,
      expiresAt: invitations.expiresAt,
      acceptedAt: invitations.acceptedAt,
      team: { id: teams.id, name: teams.name, slug: teams.slug },
    })
    .from(invitations)
    .leftJoin(teams, eq(invitations.teamId, teams.id))
    .where(eq(invitations.token, token))
    .limit(1);

  if (!invite) return NextResponse.json({ error: "Invitation not found." }, { status: 404 });
  if (invite.acceptedAt) {
    return NextResponse.json({ error: "This invitation has already been used." }, { status: 410 });
  }
  if (new Date(invite.expiresAt).getTime() < Date.now()) {
    return NextResponse.json({ error: "This invitation has expired." }, { status: 410 });
  }

  const existingUser = await findUserByAnyEmail(invite.email);
  if (existingUser) {
    return NextResponse.json({ error: "An account already exists for this email." }, { status: 409 });
  }

  const invitationTeams = await db
    .select({ id: teams.id, name: teams.name, slug: teams.slug })
    .from(invitationTeamMemberships)
    .innerJoin(teams, eq(invitationTeamMemberships.teamId, teams.id))
    .where(eq(invitationTeamMemberships.invitationId, invite.id));

  return NextResponse.json({
    invitation: {
      ...invite,
      teams: invitationTeams,
      teamIds: invitationTeams.map((team) => team.id),
    },
  });
}
