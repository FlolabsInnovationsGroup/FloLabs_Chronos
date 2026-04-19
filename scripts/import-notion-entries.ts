/**
 * scripts/import-notion-entries.ts
 *
 * ONE-TIME migration script: imports all entries from the Notion Time Entries
 * database into Chronos (Postgres via Drizzle).
 *
 * Safety: It is IDEMPOTENT. Each Notion page ID is stored in time_entries.notion_page_id.
 * Re-running the script will skip entries that are already imported.
 *
 * Usage:
 *   npx tsx scripts/import-notion-entries.ts
 *   npx tsx scripts/import-notion-entries.ts --dry-run       # print what would be imported, no writes
 *   npx tsx scripts/import-notion-entries.ts --limit 50      # import at most N entries (for testing)
 *   npx tsx scripts/import-notion-entries.ts --skip-ignored  # skip entries with Status = Ignored
 *
 * Requirements:
 *   - NOTION_API_KEY must be set (in .env.local or as env var)
 *   - NOTION_DATABASE_ID must be set (the Time Entries database)
 *   - DATABASE_URL must be set (Postgres connection string)
 */

import { eq } from "drizzle-orm";
import { createDrizzle, createPool, loadEnvFiles } from "./db-utils";
import { timeEntries, projects, users, timeEntryTags, tags } from "../src/lib/db/schema";
import type { NewTimeEntry } from "../src/lib/db/schema";

loadEnvFiles([".env.local", ".env.production.local"]);

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const SKIP_IGNORED = args.includes("--skip-ignored");
const limitArg = args.find((a) => a.startsWith("--limit=") || a === "--limit");
const LIMIT: number | null = limitArg
  ? parseInt(
      limitArg.startsWith("--limit=") ? limitArg.slice(8) : (args[args.indexOf("--limit") + 1] ?? ""),
      10,
    ) || null
  : null;

const NOTION_API_KEY = process.env.NOTION_API_KEY;
const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID;
const NOTION_TEAM_MEMBERS_DB_ID = process.env.NOTION_TEAM_MEMBERS_DB_ID;

if (!NOTION_API_KEY) throw new Error("NOTION_API_KEY is not set");
if (!NOTION_DATABASE_ID) throw new Error("NOTION_DATABASE_ID is not set");

const NOTION_HEADERS = {
  Authorization: `Bearer ${NOTION_API_KEY}`,
  "Notion-Version": "2022-06-28",
  "Content-Type": "application/json",
};

interface NotionPage {
  id: string;
  archived?: boolean;
  properties: Record<string, NotionProp>;
}

type NotionProp = Record<string, any>;

function getPropText(prop: NotionProp | undefined): string {
  if (!prop) return "";
  if (prop.type === "title") return (prop.title as Array<{ plain_text?: string }>).map((t) => t.plain_text ?? "").join("").trim();
  if (prop.type === "rich_text") return (prop.rich_text as Array<{ plain_text?: string }>).map((t) => t.plain_text ?? "").join("").trim();
  return "";
}

function getPropSelect(prop: NotionProp | undefined): string | null {
  if (!prop) return null;
  if (prop.type === "select") return (prop.select as { name?: string } | null)?.name ?? null;
  if (prop.type === "status") return (prop.status as { name?: string } | null)?.name ?? null;
  return null;
}

function getPropNumber(prop: NotionProp | undefined): number | null {
  if (!prop || prop.type !== "number") return null;
  return typeof prop.number === "number" ? prop.number : null;
}

function getPropDate(prop: NotionProp | undefined): { start: string | null; end: string | null } {
  const d = prop?.date as { start?: string; end?: string } | null | undefined;
  if (!prop || prop.type !== "date" || !d) return { start: null, end: null };
  return { start: d.start ?? null, end: d.end ?? null };
}

function getPropRelation(prop: NotionProp | undefined): string[] {
  if (!prop || prop.type !== "relation") return [];
  return (prop.relation as Array<{ id: string }>).map((r) => r.id);
}

function getPropMultiSelect(prop: NotionProp | undefined): string[] {
  if (!prop || prop.type !== "multi_select") return [];
  return (prop.multi_select as Array<{ name: string }>).map((r) => r.name);
}

async function queryAllNotionPages(databaseId: string, filter?: Record<string, unknown>): Promise<NotionPage[]> {
  const pages: NotionPage[] = [];
  let cursor: string | undefined;
  let pageNum = 0;

  do {
    pageNum++;
    const body: Record<string, unknown> = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    if (filter) body.filter = filter;

    const res = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
      method: "POST",
      headers: NOTION_HEADERS,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Notion query failed (page ${pageNum}): ${res.status} ${text}`);
    }

    const data = (await res.json()) as { results: NotionPage[]; has_more: boolean; next_cursor: string | null };
    pages.push(...data.results);
    cursor = data.has_more && data.next_cursor ? data.next_cursor : undefined;

    console.log(`  Fetched page ${pageNum}: ${data.results.length} records (total so far: ${pages.length})${data.has_more ? " - more to come." : ""}`);

    if (LIMIT && pages.length >= LIMIT) {
      console.log(`  Hit --limit ${LIMIT}, stopping early.`);
      return pages.slice(0, LIMIT);
    }
  } while (cursor);

  return pages;
}

function normalizeId(id: string): string {
  return id.replace(/-/g, "").toLowerCase();
}

async function main() {
  console.log("\nNotion -> Chronos one-time import");
  console.log(`  DRY_RUN: ${DRY_RUN}`);
  console.log(`  SKIP_IGNORED: ${SKIP_IGNORED}`);
  console.log(`  LIMIT: ${LIMIT ?? "none"}\n`);

  const pool = createPool();
  const db = createDrizzle(pool);

  try {
    console.log("Loading Chronos users and projects.");

    const chronosUsers = await db.select({
      id: users.id,
      email: users.email,
      name: users.name,
      notionTeamMemberId: users.notionTeamMemberId,
    }).from(users);

    const chronosProjects = await db.select({
      id: projects.id,
      name: projects.name,
      archived: projects.archived,
    }).from(projects);

    const notionMemberIdToUserId = new Map<string, string>();
    for (const u of chronosUsers) {
      if (u.notionTeamMemberId?.trim()) {
        notionMemberIdToUserId.set(normalizeId(u.notionTeamMemberId), u.id);
      }
    }

    const emailToUserId = new Map<string, string>();
    for (const u of chronosUsers) {
      emailToUserId.set(u.email.toLowerCase().trim(), u.id);
    }

    const projectByName = new Map<string, string>();
    for (const p of chronosProjects) {
      projectByName.set(p.name.toLowerCase().trim(), p.id);
    }

    const notionMemberEmailToChronosUserId = new Map<string, string>();
    if (NOTION_TEAM_MEMBERS_DB_ID) {
      console.log("Loading Notion Team Members for email fallback.");
      const tmPages = await queryAllNotionPages(NOTION_TEAM_MEMBERS_DB_ID);
      for (const page of tmPages) {
        const emailProp = (page.properties["Email"] ?? page.properties["Personal Email"]) as
          | { type: "email"; email?: string | null }
          | undefined;
        const emails: string[] = [];
        if (emailProp?.type === "email" && emailProp.email) {
          emails.push(emailProp.email);
        }
        for (const e of emails) {
          for (const part of e.split(",").map((s) => s.trim()).filter(Boolean)) {
            const chronosUserId = emailToUserId.get(part.toLowerCase());
            if (chronosUserId) {
              notionMemberEmailToChronosUserId.set(normalizeId(page.id), chronosUserId);
            }
          }
        }
      }
      console.log(`  Resolved ${notionMemberEmailToChronosUserId.size} Notion Team Member pages to Chronos users via email.\n`);
    }

    console.log("Fetching all Notion Time Entries (this may take a while).");
    const allNotionPages = await queryAllNotionPages(NOTION_DATABASE_ID!);
    console.log(`\n  Total Notion entries fetched: ${allNotionPages.length}\n`);

    const existingNotionPageIds = new Set<string>();
    const existingRows = await db.select({ notionPageId: timeEntries.notionPageId }).from(timeEntries);
    for (const r of existingRows) {
      if (r.notionPageId) existingNotionPageIds.add(normalizeId(r.notionPageId));
    }
    console.log(`Chronos already has ${existingNotionPageIds.size} entries with a notion_page_id.\n`);

    let skippedAlreadyExists = 0;
    let skippedNoUser = 0;
    let skippedNoDate = 0;
    let skippedIgnored = 0;
    let skippedNoDuration = 0;
    let projectsCreated = 0;
    let inserted = 0;
    let errors = 0;

    const projectsToCreate: string[] = [];

    for (const page of allNotionPages) {
      const projectName = getPropSelect(page.properties["Project"])?.trim();
      if (projectName && !projectByName.has(projectName.toLowerCase())) {
        if (!projectsToCreate.includes(projectName)) projectsToCreate.push(projectName);
      }
    }

    if (projectsToCreate.length > 0) {
      console.log(`${DRY_RUN ? "[DRY-RUN] Would create" : "Creating"} ${projectsToCreate.length} new project(s): ${projectsToCreate.join(", ")}`);
      if (!DRY_RUN) {
        for (const name of projectsToCreate) {
          const [newProject] = await db.insert(projects).values({ name }).returning();
          projectByName.set(name.toLowerCase().trim(), newProject.id);
          projectsCreated++;
          console.log(`  Created project: "${name}" (${newProject.id})`);
        }
      }
    }

    for (const page of allNotionPages) {
      if (page.archived) continue;

      const notionPageId = normalizeId(page.id);
      if (existingNotionPageIds.has(notionPageId)) {
        skippedAlreadyExists++;
        continue;
      }

      const status = getPropSelect(page.properties["Status"]);
      if (SKIP_IGNORED && status === "Ignored") {
        skippedIgnored++;
        continue;
      }

      const { start: startRaw, end: endRaw } = getPropDate(page.properties["Date"]);
      if (!startRaw) {
        skippedNoDate++;
        continue;
      }

      const startedAt = new Date(startRaw);
      const stoppedAt = endRaw ? new Date(endRaw) : null;
      if (!stoppedAt) {
        skippedNoDate++;
        continue;
      }

      const durationSecs = getPropNumber(page.properties["Duration"]);
      const durationMs =
        durationSecs != null && durationSecs > 0
          ? durationSecs * 1000
          : stoppedAt.getTime() - startedAt.getTime();

      if (durationMs <= 0) {
        skippedNoDuration++;
        continue;
      }

      const teamMemberIds = getPropRelation(page.properties["Team Member"]);
      let chronosUserId: string | null = null;

      for (const tmId of teamMemberIds) {
        const normalized = normalizeId(tmId);
        const uid = notionMemberIdToUserId.get(normalized) ?? notionMemberEmailToChronosUserId.get(normalized);
        if (uid) {
          chronosUserId = uid;
          break;
        }
      }

      if (!chronosUserId) {
        const userKey = getPropText(page.properties["User Key"]).trim();
        if (userKey) {
          const matchedUser = chronosUsers.find((u) => u.name.toLowerCase() === userKey.toLowerCase());
          if (matchedUser) chronosUserId = matchedUser.id;
        }
      }

      if (!chronosUserId) {
        const userKey = getPropText(page.properties["User Key"]);
        console.warn(`  No user found for Notion page ${page.id} (User Key: "${userKey}") - skipping.`);
        skippedNoUser++;
        continue;
      }

      const projectName = getPropSelect(page.properties["Project"])?.trim() ?? null;
      const projectId = projectName ? (projectByName.get(projectName.toLowerCase()) ?? null) : null;

      const descriptionRaw = getPropText(page.properties["Description"]).trim();
      const description = descriptionRaw.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").trim() || "Imported entry";

      const tagNames = getPropMultiSelect(page.properties["Tags"]);
      const notionPageIdFormatted = page.id;

      if (DRY_RUN) {
        const userObj = chronosUsers.find((u) => u.id === chronosUserId);
        console.log(
          `  [DRY-RUN] Would import: "${description}" | ${userObj?.name ?? chronosUserId} | ${projectName ?? "no project"} | ${startedAt.toISOString().split("T")[0]} | ${(durationMs / 3_600_000).toFixed(2)}h`,
        );
        inserted++;
        continue;
      }

      const tagIds: string[] = [];
      const existingTagRows = await db
        .select({ id: tags.id, name: tags.name })
        .from(tags)
        .where(eq(tags.userId, chronosUserId));

      for (const tagName of tagNames) {
        const existingTag = existingTagRows.find((t) => t.name.toLowerCase() === tagName.toLowerCase());

        if (existingTag) {
          tagIds.push(existingTag.id);
        } else {
          try {
            const [newTag] = await db
              .insert(tags)
              .values({ name: tagName, userId: chronosUserId })
              .onConflictDoNothing()
              .returning();
            if (newTag) tagIds.push(newTag.id);
          } catch {
            // ignore tag creation failures
          }
        }
      }

      try {
        const newEntry: NewTimeEntry = {
          userId: chronosUserId,
          projectId: projectId ?? undefined,
          description,
          startedAt,
          stoppedAt,
          durationMs,
          notionPageId: notionPageIdFormatted,
          syncedAt: new Date(),
        };

        const [entry] = await db.insert(timeEntries).values(newEntry).returning();

        if (tagIds.length > 0) {
          await db
            .insert(timeEntryTags)
            .values(tagIds.map((tagId) => ({ timeEntryId: entry.id, tagId })))
            .onConflictDoNothing();
        }

        inserted++;
        if (inserted % 50 === 0) {
          console.log(`  Imported ${inserted} entries so far.`);
        }
      } catch (err) {
        console.error(`  Failed to insert entry for page ${page.id}: ${err instanceof Error ? err.message : String(err)}`);
        errors++;
      }
    }

    console.log("\n" + "=".repeat(60));
    console.log(`Import complete${DRY_RUN ? " (dry run)" : ""}!`);
    console.log(`  Inserted:               ${inserted}`);
    console.log(`  Projects created:       ${projectsCreated}`);
    console.log(`  Skipped (exists):       ${skippedAlreadyExists}`);
    console.log(`  Skipped (no user):      ${skippedNoUser}`);
    console.log(`  Skipped (no date/end):  ${skippedNoDate}`);
    console.log(`  Skipped (no duration):  ${skippedNoDuration}`);
    if (SKIP_IGNORED) console.log(`  Skipped (Ignored):      ${skippedIgnored}`);
    console.log(`  Errors:                 ${errors}`);
    console.log("=".repeat(60) + "\n");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
