import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { timeEntries, projects, tags, users, timeEntryTags } from "@/lib/db/schema";
import { isNull, isNotNull, and, or, eq, lt, inArray } from "drizzle-orm";
import {
  syncEntryToNotionFull,
  markEntryDeleted,
  queryNotionEntriesWindow,
} from "@/lib/notion";
import {
  sendDiscordText,
  buildEntryAddedMessage,
  buildEntryEditedMessage,
  buildEntryDeletedMessage,
} from "@/lib/discord";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: Request) {
  // Validate cron secret
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!db) {
    return NextResponse.json({ error: "DB not available" }, { status: 503 });
  }

  if (!process.env.NOTION_API_KEY || !process.env.NOTION_DATABASE_ID) {
    return NextResponse.json({ error: "Notion not configured" }, { status: 503 });
  }

  let synced = 0;
  let edited = 0;
  let deleted = 0;
  let notified = 0;
  const errors: string[] = [];

  // -------------------------------------------------------------------------
  // Step 1: Upsert new / updated entries
  // -------------------------------------------------------------------------
  const pendingRows = await db
    .select({
      entry: timeEntries,
      project: projects,
      user: {
        id: users.id,
        name: users.name,
        email: users.email,
        discordWebhookUrl: users.discordWebhookUrl,
      },
    })
    .from(timeEntries)
    .leftJoin(projects, eq(timeEntries.projectId, projects.id))
    .leftJoin(users, eq(timeEntries.userId, users.id))
    .where(
      and(
        isNotNull(timeEntries.stoppedAt),
        or(
          isNull(timeEntries.notionPageId),
          lt(timeEntries.syncedAt, timeEntries.updatedAt)
        )
      )
    )
    .limit(50);

  // Fetch tags for these entries
  const entryIds = pendingRows.map((r) => r.entry.id);
  const tagRows =
    entryIds.length > 0
      ? await db
          .select({
            timeEntryId: timeEntryTags.timeEntryId,
            tagId: tags.id,
            tagName: tags.name,
          })
          .from(timeEntryTags)
          .innerJoin(tags, eq(timeEntryTags.tagId, tags.id))
          .where(inArray(timeEntryTags.timeEntryId, entryIds))
      : [];

  const tagMap = new Map<string, { id: string; name: string }[]>();
  for (const r of tagRows) {
    const existing = tagMap.get(r.timeEntryId) ?? [];
    existing.push({ id: r.tagId, name: r.tagName });
    tagMap.set(r.timeEntryId, existing);
  }

  for (const row of pendingRows) {
    const isNew = !row.entry.notionPageId;
    const entryTags = tagMap.get(row.entry.id) ?? [];
    const entryFull = {
      ...row.entry,
      project: row.project ?? undefined,
      tags: entryTags,
      user: row.user ?? undefined,
    };

    try {
      const notionPageId = await syncEntryToNotionFull(
        entryFull as Parameters<typeof syncEntryToNotionFull>[0]
      );

      if (notionPageId) {
        await db
          .update(timeEntries)
          .set({ notionPageId, syncedAt: new Date() })
          .where(eq(timeEntries.id, row.entry.id));
      }

      if (isNew) {
        synced++;
      } else {
        edited++;
      }

      // Fire-and-forget Discord notification
      const webhookUrl = row.user?.discordWebhookUrl;
      if (webhookUrl) {
        const userName = row.user?.name ?? "Unknown";
        const projectName = row.project?.name ?? "Unknown";
        const tagNames = entryTags.map((t) => t.name);

        const msg = isNew
          ? buildEntryAddedMessage({
              userName,
              project: projectName,
              tags: tagNames,
              description: row.entry.description,
              durationMs: row.entry.durationMs ?? 0,
              startedAt: new Date(row.entry.startedAt),
              updatedAt: new Date(row.entry.updatedAt ?? row.entry.startedAt),
            })
          : buildEntryEditedMessage({
              userName,
              project: projectName,
              tags: tagNames,
              description: row.entry.description,
              durationMs: row.entry.durationMs ?? 0,
              startedAt: new Date(row.entry.startedAt),
              stoppedAt: row.entry.stoppedAt ? new Date(row.entry.stoppedAt) : null,
              updatedAt: new Date(row.entry.updatedAt ?? row.entry.startedAt),
              changes: [], // diff not computed here; cron doesn't track old values
            });

        sendDiscordText(webhookUrl, msg)
          .then(() => { notified++; })
          .catch(() => { /* non-fatal */ });
      }
    } catch (err) {
      errors.push(`Entry ${row.entry.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // -------------------------------------------------------------------------
  // Step 2: Detect deletes — cross-reference Notion window vs Chronos DB
  // -------------------------------------------------------------------------
  if (process.env.NOTION_ONBOARDINGS_DB_ID) {
    try {
      const notionPages = await queryNotionEntriesWindow(360);
      const notionEntryIds = notionPages
        .map((p) => p.entryId)
        .filter((id): id is string => Boolean(id));

      if (notionEntryIds.length > 0) {
        // Check which Chronos UUIDs no longer exist
        const existing = await db
          .select({ id: timeEntries.id })
          .from(timeEntries)
          .where(inArray(timeEntries.id, notionEntryIds));

        const existingSet = new Set(existing.map((r) => r.id));
        const deletedNow = new Date();

        for (const page of notionPages) {
          if (!page.entryId || existingSet.has(page.entryId)) continue;

          try {
            await markEntryDeleted(page.notionPageId);
            deleted++;

            // We can't look up user webhook since the entry is gone — skip Discord
          } catch (err) {
            errors.push(
              `Delete sync ${page.notionPageId}: ${err instanceof Error ? err.message : String(err)}`
            );
          }

          void deletedNow; // suppress unused warning
        }
      }
    } catch (err) {
      errors.push(`Delete scan: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return NextResponse.json({
    synced,
    edited,
    deleted,
    notified,
    errors: errors.length > 0 ? errors : undefined,
  });
}
