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

function tokenize(s: string): Set<string> {
  return new Set(normalizeName(s).split(" ").filter(Boolean));
}

function scoreNameMatch(a: string, b: string): number {
  const aa = tokenize(a);
  const bb = tokenize(b);
  const inter = [...aa].filter((t) => bb.has(t)).length;
  const union = new Set([...aa, ...bb]).size;
  if (union === 0) return 0;
  let score = inter / union;
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (na.startsWith(nb) || nb.startsWith(na)) score += 0.15;
  if (na.includes(nb) || nb.includes(na)) score += 0.10;
  return Math.min(1, score);
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

function getEmail(page: NotionPage): string | null {
  for (const [key, prop] of Object.entries(page.properties)) {
    if (prop.type === "email" && prop.email && (key === "Email" || key === "Personal Email")) {
      return (prop.email as string).toLowerCase().trim();
    }
  }
  return null;
}

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!db) return NextResponse.json({ error: "DB not available" }, { status: 503 });
  if (!process.env.NOTION_API_KEY || !process.env.NOTION_TEAMS_DB_ID || !process.env.NOTION_TEAM_MEMBERS_DB_ID) {
    return NextResponse.json({ error: "Notion Teams DB not configured" }, { status: 503 });
  }

  let upserted = 0;
  let deactivated = 0;
  let membersLinked = 0;
  let membershipsSynced = 0;
  const errors: string[] = [];
  const seenNotionPageIds: string[] = [];

  try {
    const [teamPages, memberPages, userRows] = await Promise.all([
      queryAllPages(process.env.NOTION_TEAMS_DB_ID),
      queryAllPages(process.env.NOTION_TEAM_MEMBERS_DB_ID),
      db.select({ id: users.id, name: users.name, email: users.email, notionTeamMemberId: users.notionTeamMemberId }).from(users),
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
      const result = await db.update(teams).set({ isActive: false, updatedAt: new Date() }).where(and(isNotNull(teams.notionPageId), notInArray(teams.notionPageId, seenNotionPageIds))).returning({ id: teams.id });
      deactivated = result.length;
    }

    // ── STEP 2: Reload teams so we have Chronos IDs keyed by notion page ID ──
    const allTeams = await db.select({ id: teams.id, notionPageId: teams.notionPageId }).from(teams).where(isNotNull(teams.notionPageId));
    const teamIdByNotionPageId = new Map<string, string>();
    for (const team of allTeams) { if (team.notionPageId) teamIdByNotionPageId.set(team.notionPageId, team.id); }

    // ── STEP 3: Build email + name index for Chronos users ───────────────────
    const userByEmail = new Map<string, string>(); // email → userId
    const userByNotionPageId = new Map<string, string>(); // notionTeamMemberId → userId
    for (const user of userRows) {
      if (user.email) userByEmail.set(user.email.toLowerCase().trim(), user.id);
      if (user.notionTeamMemberId) userByNotionPageId.set(user.notionTeamMemberId, user.id);
    }

    // ── STEP 4: Per Team Member page — link to Chronos user + sync teams ─────
    // Clear all memberships first; we'll re-populate from Notion entirely
    // (avoids stale memberships when Notion removes someone from a team)
    const allUserIds = userRows.map((u) => u.id);
    if (allUserIds.length > 0) {
      await db.delete(teamMemberships).where(inArray(teamMemberships.userId, allUserIds));
    }

    for (const page of memberPages) {
      try {
        const name = getTitle(page);
        const email = getEmail(page);

        // Resolve Chronos user: already-linked → email → fuzzy name
        let chronosUserId: string | null = null;

        if (userByNotionPageId.has(page.id)) {
          chronosUserId = userByNotionPageId.get(page.id)!;
        } else if (email) {
          chronosUserId = userByEmail.get(email) ?? null;
        }

        if (!chronosUserId && name) {
          let bestScore = 0;
          for (const user of userRows) {
            const score = scoreNameMatch(name, user.name);
            if (score > bestScore) { bestScore = score; chronosUserId = user.id; }
          }
          if (bestScore < 0.4) chronosUserId = null;
        }

        if (!chronosUserId) continue;

        // Store the Notion Team Members page ID on the user (idempotent)
        const currentUser = userRows.find((u) => u.id === chronosUserId);
        if (currentUser && currentUser.notionTeamMemberId !== page.id) {
          await db.update(users).set({ notionTeamMemberId: page.id, updatedAt: new Date() } as Record<string, unknown>).where(eq(users.id, chronosUserId));
          membersLinked++;
        }

        // Sync memberships from the Team Member's `Team` relation
        const notionTeamIds = page.properties["Team"]?.relation?.map((r) => r.id) ?? [];
        const chronosTeamIds = notionTeamIds.map((nid) => teamIdByNotionPageId.get(nid)).filter((id): id is string => Boolean(id));

        if (chronosTeamIds.length > 0) {
          await db.insert(teamMemberships).values(chronosTeamIds.map((teamId) => ({ userId: chronosUserId!, teamId }))).onConflictDoNothing();
          // Also keep users.team_id pointing to first team for backward compat
          await db.update(users).set({ teamId: chronosTeamIds[0], updatedAt: new Date() } as Record<string, unknown>).where(and(eq(users.id, chronosUserId!), isNotNull(users.id)));
          membershipsSynced += chronosTeamIds.length;
        }
      } catch (err) {
        errors.push(`Member page ${page.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
  }

  return NextResponse.json({ upserted, deactivated, membersLinked, membershipsSynced, errors: errors.length > 0 ? errors : undefined });
}
