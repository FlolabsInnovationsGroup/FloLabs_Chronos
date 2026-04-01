import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { teams } from "@/lib/db/schema";
import { and, isNotNull, notInArray } from "drizzle-orm";
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

interface NotionPage {
  id: string;
  properties: Record<string, {
    type: string;
    title?: { plain_text: string }[];
    status?: { name: string };
    url?: string | null;
  }>;
}

async function queryAllTeamPages(): Promise<NotionPage[]> {
  const dbId = process.env.NOTION_TEAMS_DB_ID;
  if (!dbId) return [];

  const results: NotionPage[] = [];
  let cursor: string | undefined;

  do {
    const body: Record<string, unknown> = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;

    const res = await fetch(`${NOTION_API_BASE}/databases/${dbId}/query`, {
      method: "POST",
      headers: notionHeaders(),
      body: JSON.stringify(body),
    });

    if (!res.ok) break;

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

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!db) return NextResponse.json({ error: "DB not available" }, { status: 503 });

  if (!process.env.NOTION_API_KEY || !process.env.NOTION_TEAMS_DB_ID) {
    return NextResponse.json({ error: "Notion Teams DB not configured" }, { status: 503 });
  }

  let upserted = 0;
  let deactivated = 0;
  const errors: string[] = [];

  const pages = await queryAllTeamPages();
  const seenNotionPageIds: string[] = [];

  for (const page of pages) {
    try {
      // Extract Full Name from title property
      let fullName = "";
      for (const prop of Object.values(page.properties)) {
        if (prop.type === "title" && prop.title?.length) {
          fullName = prop.title.map((t) => t.plain_text).join("").trim();
          break;
        }
      }

      if (!fullName) continue;

      // Status → isActive: Active → true, others → false
      const statusProp = page.properties["Status"];
      const isActive = statusProp?.type === "status"
        ? statusProp.status?.name === "Active"
        : true;

      // Webhook URLs
      const generalWebhookProp = page.properties["General Webhook"];
      const generalWebhookUrl = generalWebhookProp?.type === "url"
        ? (generalWebhookProp.url ?? null)
        : null;

      const meetingsWebhookProp = page.properties["Meetings Webhook"];
      const meetingsWebhookUrl = meetingsWebhookProp?.type === "url"
        ? (meetingsWebhookProp.url ?? null)
        : null;

      const slug = createTeamSlug(fullName);
      seenNotionPageIds.push(page.id);

      await db
        .insert(teams)
        .values({
          name: fullName,
          slug,
          isActive,
          notionPageId: page.id,
          generalWebhookUrl,
          meetingsWebhookUrl,
        })
        .onConflictDoUpdate({
          target: teams.notionPageId,
          set: {
            name: fullName,
            slug,
            isActive,
            generalWebhookUrl,
            meetingsWebhookUrl,
            updatedAt: new Date(),
          },
        });

      upserted++;
    } catch (err) {
      errors.push(`Page ${page.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Soft-deactivate teams whose notionPageId no longer appears in Notion
  if (seenNotionPageIds.length > 0) {
    try {
      const result = await db
        .update(teams)
        .set({ isActive: false, updatedAt: new Date() })
        .where(
          and(
            isNotNull(teams.notionPageId),
            notInArray(teams.notionPageId, seenNotionPageIds)
          )
        )
        .returning({ id: teams.id });
      deactivated = result.length;
    } catch (err) {
      errors.push(`Deactivation: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return NextResponse.json({
    upserted,
    deactivated,
    errors: errors.length > 0 ? errors : undefined,
  });
}
