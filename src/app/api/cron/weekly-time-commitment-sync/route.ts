import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { getNotionConfig } from "@/lib/app-config";

export const runtime = "nodejs";
export const maxDuration = 60;

const NOTION_API_BASE = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

interface NotionProperty {
  type: string;
  title?: { plain_text?: string }[];
  email?: string | null;
  number?: number | null;
  rich_text?: { plain_text?: string }[];
}

interface NotionPage {
  id: string;
  properties: Record<string, NotionProperty>;
}

interface NotionDatabaseSchema {
  properties: Record<string, { type: string }>;
}

function notionHeaders(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "Notion-Version": NOTION_VERSION,
  };
}

function normalizeName(value: string): string {
  let s = (value ?? "").normalize("NFKD");
  s = s.replace(/[\u0141\u0142]/g, "l")
    .replace(/[\u00D8\u00F8]/g, "o")
    .replace(/[\u0110\u0111]/g, "d")
    .replace(/[\u0126\u0127]/g, "h")
    .replace(/[\u0166\u0167]/g, "t")
    .replace(/[\u00C6\u00E6]/g, "ae")
    .replace(/[\u00DF]/g, "ss");
  s = s.replace(/[\u0300-\u036f]/g, "");
  s = s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  return s;
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function getPageTitle(page: NotionPage): string {
  for (const prop of Object.values(page.properties ?? {})) {
    if (prop.type === "title" && prop.title?.length) {
      return prop.title.map((t) => t.plain_text ?? "").join("").trim();
    }
  }
  return "";
}

function getPageEmail(page: NotionPage): string | null {
  for (const [key, prop] of Object.entries(page.properties ?? {})) {
    if (prop.type === "email" && prop.email && (key === "Email" || key === "Personal Email")) {
      return normalizeEmail(prop.email);
    }
  }
  return null;
}

function getRichTextValue(prop: NotionProperty | undefined): string {
  if (!prop || prop.type !== "rich_text") return "";
  return prop.rich_text?.map((part) => part.plain_text ?? "").join("").trim() ?? "";
}

async function queryAllPages(databaseId: string, apiKey: string): Promise<NotionPage[]> {
  const pages: NotionPage[] = [];
  let cursor: string | undefined;

  do {
    const body: Record<string, unknown> = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;

    const res = await fetch(`${NOTION_API_BASE}/databases/${databaseId}/query`, {
      method: "POST",
      headers: notionHeaders(apiKey),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Notion query failed: ${text || res.statusText}`);
    }

    const data = (await res.json()) as {
      results: NotionPage[];
      has_more: boolean;
      next_cursor: string | null;
    };

    pages.push(...data.results);
    cursor = data.has_more && data.next_cursor ? data.next_cursor : undefined;
  } while (cursor);

  return pages;
}

async function getDatabaseSchema(databaseId: string, apiKey: string): Promise<NotionDatabaseSchema> {
  const res = await fetch(`${NOTION_API_BASE}/databases/${databaseId}`, {
    headers: notionHeaders(apiKey),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Notion schema lookup failed: ${text || res.statusText}`);
  }

  return (await res.json()) as NotionDatabaseSchema;
}

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!db) {
    return NextResponse.json({ error: "DB not available" }, { status: 503 });
  }

  const { notionApiKey, notionTeamMembersDbId } = await getNotionConfig();
  if (!notionApiKey || !notionTeamMembersDbId) {
    return NextResponse.json({ error: "Notion Team Members DB not configured" }, { status: 503 });
  }

  try {
    const [schema, notionPages, userRows] = await Promise.all([
      getDatabaseSchema(notionTeamMembersDbId, notionApiKey),
      queryAllPages(notionTeamMembersDbId, notionApiKey),
      db.select({
        id: users.id,
        name: users.name,
        email: users.email,
        weeklyTargetHours: users.weeklyTargetHours,
        notionTeamMemberId: users.notionTeamMemberId,
      }).from(users),
    ]);

    const timeCommitmentType = schema.properties?.["Time Commitment"]?.type;
    if (!timeCommitmentType || !["number", "rich_text"].includes(timeCommitmentType)) {
      return NextResponse.json({ error: 'Team Members database is missing a writable "Time Commitment" property.' }, { status: 409 });
    }

    const pageById = new Map(notionPages.map((page) => [page.id, page]));
    const pagesByEmail = new Map<string, NotionPage[]>();
    const pagesByName = new Map<string, NotionPage[]>();

    for (const page of notionPages) {
      const email = getPageEmail(page);
      if (email) {
        const list = pagesByEmail.get(email) ?? [];
        list.push(page);
        pagesByEmail.set(email, list);
      }

      const normalizedName = normalizeName(getPageTitle(page));
      if (normalizedName) {
        const list = pagesByName.get(normalizedName) ?? [];
        list.push(page);
        pagesByName.set(normalizedName, list);
      }
    }

    let matched = 0;
    let updated = 0;
    let skipped = 0;
    let linked = 0;
    let unmatched = 0;
    const errors: string[] = [];

    for (const user of userRows) {
      try {
        let page = user.notionTeamMemberId ? pageById.get(user.notionTeamMemberId) ?? null : null;

        if (!page) {
          const emailMatches = pagesByEmail.get(normalizeEmail(user.email)) ?? [];
          if (emailMatches.length === 1) {
            page = emailMatches[0];
          }
        }

        if (!page) {
          const nameMatches = pagesByName.get(normalizeName(user.name)) ?? [];
          if (nameMatches.length === 1) {
            page = nameMatches[0];
          }
        }

        if (!page) {
          unmatched += 1;
          continue;
        }

        matched += 1;

        if (user.notionTeamMemberId !== page.id) {
          await db.update(users).set({ notionTeamMemberId: page.id, updatedAt: new Date() }).where(eq(users.id, user.id));
          linked += 1;
        }

        const targetValue = user.weeklyTargetHours ?? 40;
        const currentProp = page.properties?.["Time Commitment"];
        const currentValue =
          currentProp?.type === "number"
            ? currentProp.number ?? null
            : currentProp?.type === "rich_text"
              ? Number(getRichTextValue(currentProp) || Number.NaN)
              : null;

        if (currentValue === targetValue) {
          skipped += 1;
          continue;
        }

        const propertyValue =
          timeCommitmentType === "number"
            ? { number: targetValue }
            : {
                rich_text: [
                  {
                    text: {
                      content: String(targetValue),
                    },
                  },
                ],
              };

        const res = await fetch(`${NOTION_API_BASE}/pages/${page.id}`, {
          method: "PATCH",
          headers: notionHeaders(notionApiKey),
          body: JSON.stringify({
            properties: {
              "Time Commitment": propertyValue,
            },
          }),
        });

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(text || res.statusText);
        }

        updated += 1;
      } catch (error) {
        errors.push(`${user.email}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return NextResponse.json({ matched, updated, skipped, linked, unmatched, errors: errors.length > 0 ? errors : undefined });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
