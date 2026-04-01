import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { teamMemberships, teams, users } from "@/lib/db/schema";
import { and, eq, inArray, isNotNull, notInArray } from "drizzle-orm";
import { createTeamSlug } from "@/lib/invitations";

export const runtime = "nodejs";
export const maxDuration = 60;

const NOTION_API_BASE = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

function notionHeaders() {
  return {
    Authorization: `Bearer ${process.env.NOTION_API_KEY}`,
    "Content-Type": "application/json",
    "Notion-Version": NOTION_VERSION,
  };
}

interface NotionProperty {
  type: string;
  title?: { plain_text: string }[];
  status?: { name: string };
  url?: string | null;
  relation?: { id: string }[];
}

interface NotionPage {
  id: string;
  properties: Record<string, NotionProperty>;
}

function normalizeName(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreNameMatch(a: string, b: string) {
  const aa = new Set(normalizeName(a).split(" ").filter(Boolean));
  const bb = new Set(normalizeName(b).split(" ").filter(Boolean));
  const inter = [...aa].filter((token) => bb.has(token)).length;
  const union = new Set([...aa, ...bb]).size;
  return union === 0 ? 0 : inter / union;
}

async function queryAllPages(databaseId: string): Promise<NotionPage[]> {
  const results: NotionPage[] = [];
  let cursor: string | undefined;

  do {
    const body: Record<string, unknown> = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;

    const res = await fetch(`${NOTION_API_BASE}/databases/${databaseId}/query`, {
      method: "POST",
      headers: notionHeaders(),
      body: JSON.stringify(body),
    });

    if (!res.ok) throw new Error(`Notion query failed for ${databaseId}: ${res.status}`);

    const data = (await res.json()) as {
      results: NotionPage[];
      has_more: boolean;
      next_cursor: string | null;
    };

    results.push(...data.results);
    cursor = data.has_more && data.next_cursor ? data.next_cursor : undefined;
  } while (cursor);

  return results;
}

function getTitle(page: NotionPage) {
  for (const prop of Object.values(page.properties)) {
    if (prop.type === "title" && prop.title?.length) {
      return prop.title.map((t) => t.plain_text).join("").trim();
    }
  }
  return "";
}

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!db) return NextResponse.json({ error: "DB not available" }, { status: 503 });

  if (!process.env.NOTION_API_KEY || !process.env.NOTION_TEAMS_DB_ID || !process.env.NOTION_TEAM_MEMBERS_DB_ID) {
    return NextResponse.json({ error: "Notion Teams DB not configured" }, { status: 503 });
  }

  let upserted = 0;
  let deactivated = 0;
  let membershipsSynced = 0;
  const errors: string[] = [];

  const seenNotionPageIds: string[] = [];

  try {
    const [teamPages, memberPages, userRows] = await Promise.all([
      queryAllPages(process.env.NOTION_TEAMS_DB_ID),
      queryAllPages(process.env.NOTION_TEAM_MEMBERS_DB_ID),
      db.select({ id: users.id, name: users.name }).from(users),
    ]);

    const memberNameByPageId = new Map<string, string>();
    for (const page of memberPages) {
      const name = getTitle(page);
      if (name) memberNameByPageId.set(page.id, name);
    }

    const chronosUserByMemberPageId = new Map<string, string>();
    for (const [pageId, memberName] of memberNameByPageId.entries()) {
      let bestUserId: string | null = null;
      let bestScore = 0;
      for (const user of userRows) {
        const score = scoreNameMatch(memberName, user.name);
        if (score > bestScore) {
          bestScore = score;
          bestUserId = user.id;
        }
      }
      if (bestUserId && bestScore >= 0.4) {
        chronosUserByMemberPageId.set(pageId, bestUserId);
      }
    }

    for (const page of teamPages) {
      try {
        const fullName = getTitle(page);
        if (!fullName) continue;

        const statusProp = page.properties["Status"];
        const isActive = statusProp?.type === "status"
          ? statusProp.status?.name === "Active"
          : true;

        const generalWebhookUrl = page.properties["General Webhook"]?.url ?? null;
        const meetingsWebhookUrl = page.properties["Meetings Webhook"]?.url ?? null;
        const slug = createTeamSlug(fullName);
        seenNotionPageIds.push(page.id);

        const existingByNotion = await db
          .select({ id: teams.id })
          .from(teams)
          .where(eq(teams.notionPageId, page.id))
          .limit(1);

        const existingBySlug = await db
          .select({ id: teams.id, notionPageId: teams.notionPageId })
          .from(teams)
          .where(eq(teams.slug, slug))
          .limit(1);

        let team;
        if (existingByNotion[0]) {
          [team] = await db
            .update(teams)
            .set({
              name: fullName,
              slug,
              isActive,
              generalWebhookUrl,
              meetingsWebhookUrl,
              updatedAt: new Date(),
            })
            .where(eq(teams.id, existingByNotion[0].id))
            .returning({ id: teams.id });
        } else if (existingBySlug[0]) {
          [team] = await db
            .update(teams)
            .set({
              name: fullName,
              slug,
              isActive,
              notionPageId: page.id,
              generalWebhookUrl,
              meetingsWebhookUrl,
              updatedAt: new Date(),
            })
            .where(eq(teams.id, existingBySlug[0].id))
            .returning({ id: teams.id });
        } else {
          [team] = await db
            .insert(teams)
            .values({
              name: fullName,
              slug,
              isActive,
              notionPageId: page.id,
              generalWebhookUrl,
              meetingsWebhookUrl,
            })
            .returning({ id: teams.id });
        }

        if (!team) continue;
        upserted++;

        const notionMemberIds = page.properties["Members"]?.relation?.map((r) => r.id) ?? [];
        const userIds = notionMemberIds
          .map((pageId) => chronosUserByMemberPageId.get(pageId))
          .filter((id): id is string => Boolean(id));

        await db.delete(teamMemberships).where(eq(teamMemberships.teamId, team.id));
        if (userIds.length > 0) {
          await db.insert(teamMemberships).values(userIds.map((userId) => ({ userId, teamId: team.id }))).onConflictDoNothing();
          membershipsSynced += userIds.length;
        }
      } catch (err) {
        errors.push(`Page ${page.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (seenNotionPageIds.length > 0) {
      const result = await db
        .update(teams)
        .set({ isActive: false, updatedAt: new Date() })
        .where(and(isNotNull(teams.notionPageId), notInArray(teams.notionPageId, seenNotionPageIds)))
        .returning({ id: teams.id });
      deactivated = result.length;
    }
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
  }

  return NextResponse.json({
    upserted,
    deactivated,
    membershipsSynced,
    errors: errors.length > 0 ? errors : undefined,
  });
}
