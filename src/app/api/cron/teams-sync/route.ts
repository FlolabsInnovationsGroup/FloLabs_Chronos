import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { applicants, teamMemberships, teams, users } from "@/lib/db/schema";
import { and, eq, isNotNull, notInArray } from "drizzle-orm";
import { createTeamSlug } from "@/lib/invitations";
import { getNotionConfig } from "@/lib/app-config";
import { ensureTeamMemberPage } from "@/lib/notion";

export const runtime = "nodejs";
export const maxDuration = 60;

const NOTION_API_BASE = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

function notionHeaders(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "Notion-Version": NOTION_VERSION,
  };
}

interface NotionProperty {
  type: string;
  title?: { plain_text: string }[];
  rich_text?: { plain_text: string }[];
  status?: { name: string };
  url?: string | null;
  email?: string | null;
  relation?: { id: string }[];
}

interface NotionPage {
  id: string;
  properties: Record<string, NotionProperty>;
}

async function queryAllPages(databaseId: string, apiKey: string): Promise<NotionPage[]> {
  const results: NotionPage[] = [];
  let cursor: string | undefined;
  do {
    const body: Record<string, unknown> = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    const res = await fetch(`${NOTION_API_BASE}/databases/${databaseId}/query`, {
      method: "POST",
      headers: notionHeaders(apiKey),
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Notion query failed for ${databaseId}: ${res.status}`);
    const data = (await res.json()) as { results: NotionPage[]; has_more: boolean; next_cursor: string | null };
    results.push(...data.results);
    cursor = data.has_more && data.next_cursor ? data.next_cursor : undefined;
  } while (cursor);
  return results;
}

function getTitle(page: NotionPage): string {
  for (const prop of Object.values(page.properties)) {
    if (prop.type === "title" && prop.title?.length) return prop.title.map((t) => t.plain_text).join("").trim();
  }
  return "";
}

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!db) return NextResponse.json({ error: "DB not available" }, { status: 503 });

  let upserted = 0;
  let deactivated = 0;
  let usersSyncedFromNotion = 0;
  let pagesMissingInNotion = 0;
  let membershipsSynced = 0;
  let applicantsSyncedToTeamMembers = 0;
  const errors: string[] = [];
  const seenNotionPageIds: string[] = [];

  try {
    const config = await getNotionConfig();
    const notionApiKey = process.env.NOTION_API_KEY || config.notionApiKey;
    const teamsDbId = process.env.NOTION_TEAMS_DB_ID || config.notionTeamsDbId;
    const teamMembersDbId = process.env.NOTION_TEAM_MEMBERS_DB_ID || config.notionTeamMembersDbId;
    if (!notionApiKey || !teamsDbId || !teamMembersDbId) {
      return NextResponse.json({ error: "Notion Teams DB not configured" }, { status: 503 });
    }

    const [teamPages, memberPages, userRows] = await Promise.all([
      queryAllPages(teamsDbId, notionApiKey),
      queryAllPages(teamMembersDbId, notionApiKey),
      db.select({ id: users.id, email: users.email, notionTeamMemberId: users.notionTeamMemberId }).from(users),
    ]);

    // ── STEP 1: Upsert teams ─────────────────────────────────────────────────
    for (const page of teamPages) {
      try {
        const fullName = getTitle(page);
        if (!fullName) continue;
        const statusProp = page.properties["Status"];
        const isActive = statusProp?.type === "status" ? statusProp.status?.name === "Active" : true;
        const generalWebhookUrl = page.properties["General Webhook"]?.url ?? null;
        const meetingsWebhookUrl = page.properties["Meetings Webhook"]?.url ?? null;
        const slug = createTeamSlug(fullName);
        seenNotionPageIds.push(page.id);

        const existingByNotion = await db.select({ id: teams.id }).from(teams).where(eq(teams.notionPageId, page.id)).limit(1);
        const existingBySlug = await db.select({ id: teams.id }).from(teams).where(eq(teams.slug, slug)).limit(1);

        if (existingByNotion[0]) {
          await db.update(teams).set({ name: fullName, slug, isActive, generalWebhookUrl, meetingsWebhookUrl, updatedAt: new Date() }).where(eq(teams.id, existingByNotion[0].id));
        } else if (existingBySlug[0]) {
          await db.update(teams).set({ name: fullName, slug, isActive, notionPageId: page.id, generalWebhookUrl, meetingsWebhookUrl, updatedAt: new Date() }).where(eq(teams.id, existingBySlug[0].id));
        } else {
          await db.insert(teams).values({ name: fullName, slug, isActive, notionPageId: page.id, generalWebhookUrl, meetingsWebhookUrl });
        }
        upserted++;
      } catch (err) {
        errors.push(`Team page ${page.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (seenNotionPageIds.length > 0) {
      const result = await db.update(teams).set({ isActive: false, updatedAt: new Date() }).where(and(isNotNull(teams.notionPageId), notInArray(teams.notionPageId, seenNotionPageIds))).returning();
      deactivated = result.length;
    }

    // ── STEP 2: Chronos team rows keyed by Notion team page id ───────────────
    const allTeams = await db.select({ id: teams.id, notionPageId: teams.notionPageId }).from(teams).where(isNotNull(teams.notionPageId));
    const teamIdByNotionPageId = new Map<string, string>();
    const notionPageIdByTeamId = new Map<string, string>();
    for (const team of allTeams) {
      if (team.notionPageId) {
        teamIdByNotionPageId.set(team.notionPageId, team.id);
        notionPageIdByTeamId.set(team.id, team.notionPageId);
      }
    }

    const memberPageById = new Map<string, NotionPage>();
    for (const p of memberPages) {
      memberPageById.set(p.id, p);
    }

    // ── STEP 3: Sync `Team` relation from each user's linked Team Member page ─
    // Only users with notion_team_member_id are updated here (no email/name matching).
    // Users without a link keep existing Chronos memberships (e.g. until an admin links Notion).
    for (const user of userRows) {
      if (!user.notionTeamMemberId) continue;

      const page = memberPageById.get(user.notionTeamMemberId);
      if (!page) {
        pagesMissingInNotion++;
        errors.push(`User ${user.email}: Notion Team Member page ${user.notionTeamMemberId} not found`);
        continue;
      }

      try {
        await db.delete(teamMemberships).where(eq(teamMemberships.userId, user.id));

        const notionTeamIds = page.properties["Team"]?.relation?.map((r) => r.id) ?? [];
        const chronosTeamIds = notionTeamIds.map((nid) => teamIdByNotionPageId.get(nid)).filter((id): id is string => Boolean(id));

        if (chronosTeamIds.length > 0) {
          await db.insert(teamMemberships).values(chronosTeamIds.map((teamId) => ({ userId: user.id, teamId }))).onConflictDoNothing();
          await db.update(users).set({ teamId: chronosTeamIds[0], updatedAt: new Date() }).where(eq(users.id, user.id));
          membershipsSynced += chronosTeamIds.length;
        } else {
          await db.update(users).set({ teamId: null, updatedAt: new Date() }).where(eq(users.id, user.id));
        }

        usersSyncedFromNotion++;
      } catch (err) {
        errors.push(`User ${user.email} (page ${user.notionTeamMemberId}): ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // ── STEP 4: For linked applicants eligible for Team Members refresh, push canonical profile data to Notion ─
    const joinedApplicants = await db
      .select({
        id: applicants.id,
        email: applicants.email,
        name: applicants.name,
        stage: applicants.stage,
        status: applicants.status,
        teamId: applicants.teamId,
        notionTeamMemberId: applicants.notionTeamMemberId,
        isActive: applicants.isActive,
        syncedToTeamMembers: applicants.syncedToTeamMembers,
      })
      .from(applicants)
      .where(isNotNull(applicants.chronosUserId));

    for (const applicant of joinedApplicants) {
      const stage = applicant.stage?.toLowerCase() ?? "";
      const status = applicant.status?.toLowerCase() ?? "";
      const eligibleForRefresh = applicant.syncedToTeamMembers || applicant.isActive || stage === "joined" || stage === "chronos_synced" || status === "joined" || status === "active" || status === "signed";
      if (!eligibleForRefresh) continue;
      if (!applicant.notionTeamMemberId || !applicant.teamId) continue;
      const notionTeamPageId = notionPageIdByTeamId.get(applicant.teamId);
      if (!notionTeamPageId) continue;

      try {
        await ensureTeamMemberPage({
          email: applicant.email,
          name: applicant.name,
          notionTeamPageIds: [notionTeamPageId],
          notionTeamMemberPageId: applicant.notionTeamMemberId,
        });
        await db
          .update(applicants)
          .set({ syncedToTeamMembers: true, updatedAt: new Date() })
          .where(eq(applicants.id, applicant.id));
        applicantsSyncedToTeamMembers++;
      } catch (err) {
        errors.push(`Applicant ${applicant.email} Team Member sync: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
  }

  return NextResponse.json({
    upserted,
    deactivated,
    usersSyncedFromNotion,
    applicantsSyncedToTeamMembers,
    pagesMissingInNotion,
    membershipsSynced,
    errors: errors.length > 0 ? errors : undefined,
  });
}
