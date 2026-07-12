import { NextResponse } from "next/server";
import { and, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { requireChronosUserIdFromSessionUser } from "@/lib/chronos-session";
import { db } from "@/lib/db";
import { invitationTeamMemberships, invitations, teams, users } from "@/lib/db/schema";
import { buildInviteUrl, createInvitationToken, normalizeEmail } from "@/lib/invitations";
import {
  ensureTeamMemberPage,
  getInviteSourceFromNotionTeamMemberPage,
  normalizeNotionId,
  TeamMemberLookupConflictError,
} from "@/lib/notion";
import { canManageInvitations } from "@/lib/permissions";
import { broadcastDataChange } from "@/lib/realtime";
import { findUserByAnyEmail } from "@/lib/user-email-aliases";

const createInvitationSchema = z
  .object({
    email: z.string().optional(),
    name: z.string().min(1),
    role: z.enum(["team_lead", "member"]).default("member"),
    teamId: z.string().uuid().optional(),
    teamIds: z.array(z.string().uuid()).optional(),
    expiresAt: z.coerce.date().optional(),
    notionTeamMemberPageId: z.string().min(1).optional(),
    createNewNotionTeamMember: z.boolean().optional(),
  })
  .refine((d) => Boolean(d.notionTeamMemberPageId) || d.createNewNotionTeamMember === true, {
    message: "Select a Team Member page in Notion, or choose to create a new one.",
    path: ["notionTeamMemberPageId"],
  })
  .refine((d) => !(d.notionTeamMemberPageId && d.createNewNotionTeamMember), {
    message: "Cannot both select an existing page and create a new one.",
    path: ["createNewNotionTeamMember"],
  })
  .superRefine((d, ctx) => {
    const useNotionSource = Boolean(d.notionTeamMemberPageId) && d.createNewNotionTeamMember !== true;
    if (useNotionSource) return;
    const trimmed = d.email?.trim() ?? "";
    if (!trimmed) {
      ctx.addIssue({ code: "custom", message: "Email is required.", path: ["email"] });
    } else if (!z.string().email().safeParse(trimmed).success) {
      ctx.addIssue({ code: "custom", message: "Invalid email address.", path: ["email"] });
    }
    const teamIds = d.teamIds ?? (d.teamId ? [d.teamId] : []);
    if (teamIds.length === 0) {
      ctx.addIssue({ code: "custom", message: "At least one team is required.", path: ["teamIds"] });
    }
  });

async function getInvitationTeams(invitationIds: string[]) {
  if (!db || invitationIds.length === 0) return new Map<string, { id: string; name: string; slug: string }[]>();
  const rows = await db
    .select({
      invitationId: invitationTeamMemberships.invitationId,
      team: { id: teams.id, name: teams.name, slug: teams.slug },
    })
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

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user || !canManageInvitations(session.user)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!db) return NextResponse.json({ invitations: [] });

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

    const teamsByInvitation = await getInvitationTeams(rows.map((row) => row.id));
    return NextResponse.json({
      invitations: rows.map((invite) => ({
        ...invite,
        teams: teamsByInvitation.get(invite.id) ?? (invite.team ? [invite.team] : []),
        teamIds: (teamsByInvitation.get(invite.id) ?? []).map((team) => team.id),
        inviteUrl: buildInviteUrl(invite.token),
      })),
    });
  } catch (err) {
    console.error("[api/invitations GET]", err);
    const message = err instanceof Error ? err.message : String(err);
    if (/invitations|column .*invitations|relation .*invitations/i.test(message)) {
      return NextResponse.json(
        {
          error:
            "Invitations data is temporarily unavailable in this environment. Users and teams are still accessible.",
        },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: "Failed to load invitations." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user || !canManageInvitations(session.user)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!db) {
      return NextResponse.json({ error: "DB not available" }, { status: 503 });
    }

    let invitedById: string;
    try {
      invitedById = requireChronosUserIdFromSessionUser(session.user);
    } catch {
      return NextResponse.json({ error: "Your session is invalid. Please sign in again." }, { status: 401 });
    }

    const [inviterRow] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, invitedById))
      .limit(1);
    if (!inviterRow) {
      return NextResponse.json(
        { error: "Your account is not provisioned in Chronos yet. Sign out and sign in again, or contact support." },
        { status: 403 },
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }
    const parsed = createInvitationSchema.safeParse(body);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return NextResponse.json({ error: first?.message ?? "Invalid input" }, { status: 400 });
    }

    const useNotionMemberSource =
      Boolean(parsed.data.notionTeamMemberPageId) && parsed.data.createNewNotionTeamMember !== true;

    let normalizedEmail: string;
    let teamIds: string[];
    let inviteName = parsed.data.name.trim();
    let notionTeamPageIdsForEnsure: string[];

    if (useNotionMemberSource) {
      let notionSource: Awaited<ReturnType<typeof getInviteSourceFromNotionTeamMemberPage>>;
      try {
        notionSource = await getInviteSourceFromNotionTeamMemberPage(parsed.data.notionTeamMemberPageId!);
      } catch (e) {
        const message = e instanceof Error ? e.message : "Could not read Team Member from Notion.";
        return NextResponse.json({ error: message }, { status: 400 });
      }
      inviteName = notionSource.name.trim() || inviteName;
      normalizedEmail = normalizeEmail(notionSource.email);

      const teamLinkRows = await db
        .select({ id: teams.id, notionPageId: teams.notionPageId })
        .from(teams)
        .where(isNotNull(teams.notionPageId));
      const chronosIdByNotionNorm = new Map<string, string>();
      for (const row of teamLinkRows) {
        if (row.notionPageId) chronosIdByNotionNorm.set(normalizeNotionId(row.notionPageId), row.id);
      }
      teamIds = [];
      for (const nid of notionSource.notionTeamPageIds) {
        const chronosId = chronosIdByNotionNorm.get(normalizeNotionId(nid));
        if (chronosId && !teamIds.includes(chronosId)) teamIds.push(chronosId);
      }
      if (teamIds.length === 0) {
        return NextResponse.json(
          {
            error:
              "None of the teams linked on this Notion page are synced to Chronos yet. Check team sync or link teams that exist in Chronos.",
          },
          { status: 400 },
        );
      }
      notionTeamPageIdsForEnsure = notionSource.notionTeamPageIds;
    } else {
      normalizedEmail = normalizeEmail(parsed.data.email!.trim());
      teamIds = parsed.data.teamIds ?? (parsed.data.teamId ? [parsed.data.teamId] : []);
      if (teamIds.length === 0) {
        return NextResponse.json({ error: "At least one team is required." }, { status: 400 });
      }
      notionTeamPageIdsForEnsure = [];
    }

    const teamRows = await db
      .select({ id: teams.id, name: teams.name, slug: teams.slug, notionPageId: teams.notionPageId })
      .from(teams)
      .where(inArray(teams.id, teamIds));
    if (teamRows.length !== teamIds.length) {
      return NextResponse.json({ error: "One or more selected teams do not exist." }, { status: 404 });
    }

    const existingUser = await findUserByAnyEmail(normalizedEmail);
    if (existingUser) {
      return NextResponse.json({ error: "This email already has an account." }, { status: 409 });
    }

    const [existingInvite] = await db
      .select({ id: invitations.id, token: invitations.token, expiresAt: invitations.expiresAt })
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
        { status: 409 },
      );
    }

    const token = createInvitationToken();
    let expiresAt: Date;
    if (parsed.data.expiresAt != null) {
      expiresAt = parsed.data.expiresAt;
    } else {
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);
    }
    if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
      return NextResponse.json({ error: "Expiration must be a valid future date." }, { status: 400 });
    }

    const notionTeamPageIds = useNotionMemberSource
      ? notionTeamPageIdsForEnsure
      : teamRows.map((team) => team.notionPageId).filter((id): id is string => Boolean(id));
    if (!useNotionMemberSource && notionTeamPageIds.length !== teamRows.length) {
      return NextResponse.json(
        { error: "One or more selected teams are not linked to a Notion team page yet." },
        { status: 409 },
      );
    }
    if (teamRows.some((t) => !t.notionPageId)) {
      return NextResponse.json(
        { error: "One or more selected teams are not linked to a Notion team page yet." },
        { status: 409 },
      );
    }

    const notionResult = await ensureTeamMemberPage({
      email: normalizedEmail,
      name: inviteName,
      notionTeamPageIds,
      notionTeamMemberPageId: parsed.data.notionTeamMemberPageId,
      forceCreateNew: parsed.data.createNewNotionTeamMember === true,
    });
    const notionPageId = notionResult?.pageId ?? null;

    const [invite] = await db
      .insert(invitations)
      .values({
        email: normalizedEmail,
        name: inviteName,
        role: parsed.data.role,
        teamId: teamIds[0],
        token,
        invitedById,
        expiresAt,
        notionTeamMemberId: notionPageId,
      })
      .returning();
    await db
      .insert(invitationTeamMemberships)
      .values(teamIds.map((teamId) => ({ invitationId: invite.id, teamId })))
      .onConflictDoNothing();

    broadcastDataChange("team");
    return NextResponse.json(
      {
        invitation: { ...invite, teams: teamRows, teamIds },
        inviteUrl: buildInviteUrl(token, req.url),
        delivery: "manual",
      },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof TeamMemberLookupConflictError) {
      return NextResponse.json({ error: err.message, matches: err.matches }, { status: 409 });
    }
    console.error("[api/invitations POST]", err);
    const message = err instanceof Error ? err.message : String(err);
    if (/notion_team_member_id|column .*notion_team_member_id/i.test(message)) {
      return NextResponse.json(
        {
          error:
            "Database is missing invitations.notion_team_member_id. Run `pnpm db:migrate:invitations-notion` (or `pnpm db:push`) against this environment.",
        },
        { status: 503 },
      );
    }
    const notionOrUpstream =
      /notion/i.test(message) ||
      message.includes("Team Members database") ||
      message.includes("Onboarding database");
    return NextResponse.json({ error: message }, { status: notionOrUpstream ? 502 : 500 });
  }
}
