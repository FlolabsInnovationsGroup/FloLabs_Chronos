import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { teamMemberships, teams, users } from "@/lib/db/schema";
import { and, eq, isNotNull, notInArray, sql } from "drizzle-orm";
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
  select?: { name: string } | null;
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

function normalizeChronosRole(input: string | null | undefined): string | null {
  const value = String(input ?? "").trim().toLowerCase();
  if (!value) return null;
  if (value === "administrator" || value === "admin") return "admin";
  if (value === "human resources" || value === "hr" || value === "human_resources") return "hr";
  if (value === "team lead" || value === "team_lead" || value === "teamlead") return "team_lead";
  return "member";
}

function splitNotionEmails(input: string | null | undefined): string[] {
  return String(input ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email.length > 0 && email.includes("@"));
}

function notionPageEmails(page: NotionPage): string[] {
  return Array.from(
    new Set([
      ...splitNotionEmails(page.properties["Email"]?.email),
      ...splitNotionEmails(page.properties["Personal Email"]?.email),
    ])
  );
}

function textArraySql(values: string[]) {
  return sql`ARRAY[${sql.join(values.map((value) => sql`${value}`), sql`, `)}]::text[]`;
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
  let activeAccountsLinkedFromNotion = 0;
  let activeAccountRolesSyncedFromNotion = 0;
  const errors: string[] = [];
  const seenNotionPageIds: string[] = [];
  const shouldRefreshNotionTeamMembers = new URL(req.url).searchParams.get("refreshNotion") === "1";

  try {
    const config = await getNotionConfig();
    const notionApiKey = config.notionApiKey;
    const teamsDbId = config.notionTeamsDbId;
    const teamMembersDbId = config.notionTeamMembersDbId;
    if (!notionApiKey || !teamsDbId || !teamMembersDbId) {
      return NextResponse.json({ error: "Notion Teams DB not configured" }, { status: 503 });
    }

    const [teamPages, memberPages] = await Promise.all([
      queryAllPages(teamsDbId, notionApiKey),
      queryAllPages(teamMembersDbId, notionApiKey),
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

    // ── STEP 2b: Notion Team Members is the canonical FloLabs account source for
    // operational status/role. Chronos stores enabled accounts as joined, so an
    // Active Notion Team Member page must become joined + active locally and must
    // mirror Role into `flolabs_users` (single identity row).
    for (const page of memberPages) {
      const notionStatus = page.properties["Status"]?.status?.name ?? null;
      if (notionStatus !== "Active") continue;

      const normalizedRole = normalizeChronosRole(page.properties["Role"]?.select?.name);
      const emails = notionPageEmails(page);
      if (emails.length === 0) continue;
      const emailArray = textArraySql(emails);

      const combinedResult = await db.execute(sql`
        UPDATE flolabs_users u
        SET
          notion_team_member_id = ${page.id},
          status = 'joined',
          stage = 'joined',
          role = COALESCE(${normalizedRole}, u.role),
          is_active = true,
          updated_at = now()
        WHERE (
          u.notion_team_member_id = ${page.id}
          OR lower(u.email) = ANY(${emailArray})
          OR EXISTS (
            SELECT 1
            FROM jsonb_array_elements_text(COALESCE(u.hubspot_raw_data->'emails', '[]'::jsonb)) AS e(email)
            WHERE lower(e.email) = ANY(${emailArray})
          )
          OR EXISTS (
            SELECT 1
            FROM user_email_aliases ua
            WHERE ua.user_id = u.id
              AND lower(ua.email) = ANY(${emailArray})
          )
        )
          AND lower(coalesce(u.status, '')) NOT IN ('terminated', 'graduated', 'closed')
      `);

      const rows =
        (combinedResult as unknown as { rowCount?: number; rowsAffected?: number }).rowCount ??
        (combinedResult as unknown as { rowsAffected?: number }).rowsAffected ??
        0;
      activeAccountsLinkedFromNotion += rows;
      if (normalizedRole) activeAccountRolesSyncedFromNotion += rows;
    }

    // ── STEP 3: Sync `Team` relation from each linked Team Member page ─
    const applicantRows = await db
      .select({
        id: users.id,
        email: users.email,
        notionTeamMemberId: users.notionTeamMemberId,
      })
      .from(users)
      .where(and(isNotNull(users.notionTeamMemberId)));

    for (const row of applicantRows) {
      const userId = row.id;
      const notionMemberId = row.notionTeamMemberId!;

      const page = memberPageById.get(notionMemberId);
      if (!page) {
        pagesMissingInNotion++;
        errors.push(`Applicant ${row.email}: Notion Team Member page ${notionMemberId} not found`);
        continue;
      }

      try {
        await db.delete(teamMemberships).where(eq(teamMemberships.userId, userId));

        const notionTeamIds = page.properties["Team"]?.relation?.map((r) => r.id) ?? [];
        const chronosTeamIds = notionTeamIds.map((nid) => teamIdByNotionPageId.get(nid)).filter((id): id is string => Boolean(id));

        if (chronosTeamIds.length > 0) {
          await db.insert(teamMemberships).values(chronosTeamIds.map((teamId) => ({ userId, teamId }))).onConflictDoNothing();
          await db
            .update(users)
            .set({ teamId: chronosTeamIds[0], notionTeamMemberId: notionMemberId, updatedAt: new Date() })
            .where(eq(users.id, userId));
          membershipsSynced += chronosTeamIds.length;
        } else {
          await db.update(users).set({ teamId: null, updatedAt: new Date() }).where(eq(users.id, userId));
        }

        usersSyncedFromNotion++;
      } catch (err) {
        errors.push(`Applicant ${row.email} (page ${notionMemberId}): ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // ── STEP 4: For linked applicants eligible for Team Members refresh, push canonical profile data to Notion ─
    // This is intentionally opt-in. The deploy pipeline needs this endpoint to repair local
    // Chronos links/roles from Notion quickly; pushing every joined applicant back to Notion
    // can exceed App Runner/GitHub curl timeouts and is not required for that repair path.
    if (shouldRefreshNotionTeamMembers) {
      const joinedApplicants = await db
        .select({
          id: users.id,
          email: users.email,
          name: users.name,
          stage: users.stage,
          status: users.status,
          teamId: users.teamId,
          notionTeamMemberId: users.notionTeamMemberId,
          isActive: users.isActive,
          syncedToTeamMembers: users.syncedToTeamMembers,
        })
        .from(users)
        .where(isNotNull(users.notionTeamMemberId));

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
            .update(users)
            .set({ syncedToTeamMembers: true, updatedAt: new Date() })
            .where(eq(users.id, applicant.id));
          applicantsSyncedToTeamMembers++;
        } catch (err) {
          errors.push(`Applicant ${applicant.email} Team Member sync: ${err instanceof Error ? err.message : String(err)}`);
        }
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
    activeAccountsLinkedFromNotion,
    activeAccountRolesSyncedFromNotion,
    pagesMissingInNotion,
    membershipsSynced,
    errors: errors.length > 0 ? errors : undefined,
  });
}
