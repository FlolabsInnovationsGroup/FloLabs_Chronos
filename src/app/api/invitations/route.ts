import { NextResponse } from "next/server";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { invitationTeamMemberships, invitations, teams, users } from "@/lib/db/schema";
import { buildInviteUrl, createInvitationToken, normalizeEmail } from "@/lib/invitations";
import { canManageInvitations } from "@/lib/permissions";
import { broadcastDataChange } from "@/lib/realtime";

const createInvitationSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  role: z.enum(["team_lead", "member"]).default("member"),
  teamId: z.string().uuid().optional(),
  teamIds: z.array(z.string().uuid()).optional(),
  expiresAt: z.string().datetime().optional(),
});

const NOTION_API_BASE = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

function notionHeaders() {
  return {
    Authorization: `Bearer ${process.env.NOTION_API_KEY}`,
    "Content-Type": "application/json",
    "Notion-Version": NOTION_VERSION,
  };
}

async function getInvitationTeams(invitationIds: string[]) {
  if (!db || invitationIds.length === 0) return new Map<string, { id: string; name: string; slug: string }[]>();
  const rows = await db
    .select({ invitationId: invitationTeamMemberships.invitationId, team: { id: teams.id, name: teams.name, slug: teams.slug } })
    .from(invitationTeamMemberships)
    .innerJoin(teams, eq(invitationTeamMemberships.teamId, teams.id))
    .where(inArray(invitationTeamMemberships.invitationId, invitationIds));
  const map = new Map<string, { id: string; name: string; slug: string }[]>();
  for (const row of rows) {
    const list = map.get(row.invitationId) ?? [];
    list.push(row.team);
    map.set(row.invitationId, list);
  }
  return map;
}

async function ensureNotionTeamMemberPage(email: string, name: string, notionTeamPageIds: string[]) {
  if (!process.env.NOTION_API_KEY || !process.env.NOTION_TEAM_MEMBERS_DB_ID) return;

  const queryRes = await fetch(`${NOTION_API_BASE}/databases/${process.env.NOTION_TEAM_MEMBERS_DB_ID}/query`, {
    method: "POST",
    headers: notionHeaders(),
    body: JSON.stringify({
      filter: { property: "Email", email: { equals: email } },
      page_size: 1,
    }),
  });
  if (!queryRes.ok) return;
  const queryData = await queryRes.json() as { results: { id: string }[] };
  if (queryData.results.length > 0) return;

  await fetch(`${NOTION_API_BASE}/pages`, {
    method: "POST",
    headers: notionHeaders(),
    body: JSON.stringify({
      parent: { database_id: process.env.NOTION_TEAM_MEMBERS_DB_ID },
      properties: {
        Name: { title: [{ text: { content: name } }] },
        Email: { email },
        Team: { relation: notionTeamPageIds.map((id) => ({ id })) },
        Status: { status: { name: "Onboarding" } },
      },
    }),
  });
}

export async function GET() {
  const session = await auth();
  if (!session?.user || !canManageInvitations(session.user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!db) return NextResponse.json({ invitations: [] });

  const rows = await db
    .select({ id: invitations.id, email: invitations.email, name: invitations.name, role: invitations.role, teamId: invitations.teamId, token: invitations.token, invitedById: invitations.invitedById, expiresAt: invitations.expiresAt, acceptedAt: invitations.acceptedAt, createdAt: invitations.createdAt, team: { id: teams.id, name: teams.name, slug: teams.slug } })
    .from(invitations)
    .leftJoin(teams, eq(invitations.teamId, teams.id))
    .orderBy(desc(invitations.createdAt));

  const teamsByInvitation = await getInvitationTeams(rows.map((row) => row.id));
  return NextResponse.json({ invitations: rows.map((invite) => ({ ...invite, teams: teamsByInvitation.get(invite.id) ?? (invite.team ? [invite.team] : []), teamIds: (teamsByInvitation.get(invite.id) ?? []).map((team) => team.id), inviteUrl: buildInviteUrl(invite.token) })) });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user || !canManageInvitations(session.user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!db) return NextResponse.json({ error: "DB not available" }, { status: 503 });

  const body = await req.json();
  const parsed = createInvitationSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const normalizedEmail = normalizeEmail(parsed.data.email);
  const teamIds = parsed.data.teamIds ?? (parsed.data.teamId ? [parsed.data.teamId] : []);
  if (teamIds.length === 0) return NextResponse.json({ error: "At least one team is required." }, { status: 400 });

  const teamRows = await db.select({ id: teams.id, name: teams.name, slug: teams.slug, notionPageId: teams.notionPageId }).from(teams).where(inArray(teams.id, teamIds));
  if (teamRows.length !== teamIds.length) return NextResponse.json({ error: "One or more selected teams do not exist." }, { status: 404 });

  const [existingUser] = await db.select({ id: users.id }).from(users).where(eq(users.email, normalizedEmail)).limit(1);
  if (existingUser) return NextResponse.json({ error: "This email already has an account." }, { status: 409 });

  const [existingInvite] = await db.select({ id: invitations.id, token: invitations.token, expiresAt: invitations.expiresAt }).from(invitations).where(and(eq(invitations.email, normalizedEmail), isNull(invitations.acceptedAt))).orderBy(desc(invitations.createdAt)).limit(1);
  if (existingInvite && new Date(existingInvite.expiresAt).getTime() > Date.now()) {
    return NextResponse.json({ error: "A pending invitation already exists for this email.", inviteUrl: buildInviteUrl(existingInvite.token, req.url) }, { status: 409 });
  }

  const token = createInvitationToken();
  const expiresAt = parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : new Date();
  if (!parsed.data.expiresAt) {
    expiresAt.setDate(expiresAt.getDate() + 7);
  }
  if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
    return NextResponse.json({ error: "Expiration must be a valid future date." }, { status: 400 });
  }

  const [invite] = await db.insert(invitations).values({ email: normalizedEmail, name: parsed.data.name.trim(), role: parsed.data.role, teamId: teamIds[0], token, invitedById: session.user.id, expiresAt }).returning();
  await db.insert(invitationTeamMemberships).values(teamIds.map((teamId) => ({ invitationId: invite.id, teamId }))).onConflictDoNothing();

  await ensureNotionTeamMemberPage(normalizedEmail, parsed.data.name.trim(), teamRows.map((team) => team.notionPageId).filter((id): id is string => Boolean(id)));

  broadcastDataChange("team");
  return NextResponse.json({ invitation: { ...invite, teams: teamRows, teamIds }, inviteUrl: buildInviteUrl(token, req.url), delivery: "manual" }, { status: 201 });
}
