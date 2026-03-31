import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { timeEntries, projects, tags, users, timeEntryTags } from "@/lib/db/schema";
import { isNull, isNotNull, and, or, eq, lt, inArray } from "drizzle-orm";
import { syncEntryToNotion } from "@/lib/notion";

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

  const pendingRows = await db
    .select({
      entry: timeEntries,
      project: projects,
      user: { id: users.id, name: users.name, email: users.email },
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
  const tagRows = entryIds.length > 0
    ? await db
        .select({ timeEntryId: timeEntryTags.timeEntryId, tagId: tags.id, tagName: tags.name })
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

  let synced = 0;
  const errors: string[] = [];

  for (const row of pendingRows) {
    const entry = {
      ...row.entry,
      project: row.project ?? undefined,
      tags: tagMap.get(row.entry.id) ?? [],
      user: row.user ?? undefined,
    };

    try {
      const notionPageId = await syncEntryToNotion(entry as Parameters<typeof syncEntryToNotion>[0]);

      await db
        .update(timeEntries)
        .set({ notionPageId, syncedAt: new Date() })
        .where(eq(timeEntries.id, entry.id));

      synced++;
    } catch (err) {
      errors.push(`Entry ${entry.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return NextResponse.json({
    synced,
    errors: errors.length > 0 ? errors : undefined,
  });
}
