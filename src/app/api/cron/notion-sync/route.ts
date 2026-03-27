import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { timeEntries, projects, tags, users } from "@/lib/db/schema";
import { isNull, isNotNull, and, eq } from "drizzle-orm";
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

  // Find entries that need syncing:
  // - notion_page_id IS NULL (never synced), AND stoppedAt IS NOT NULL (completed)
  // We check up to 50 at a time
  const pendingEntries = await db
    .select({
      entry: timeEntries,
      project: projects,
      tag: tags,
      user: { id: users.id, name: users.name, email: users.email },
    })
    .from(timeEntries)
    .leftJoin(projects, eq(timeEntries.projectId, projects.id))
    .leftJoin(tags, eq(timeEntries.tagId, tags.id))
    .leftJoin(users, eq(timeEntries.userId, users.id))
    .where(
      and(
        isNotNull(timeEntries.stoppedAt),
        isNull(timeEntries.notionPageId)
      )
    )
    .limit(50);

  let synced = 0;
  const errors: string[] = [];

  for (const row of pendingEntries) {
    const entry = {
      ...row.entry,
      project: row.project ?? undefined,
      tag: row.tag ?? null,
      user: row.user ?? undefined,
    };

    try {
      const notionPageId = await syncEntryToNotion(entry as Parameters<typeof syncEntryToNotion>[0]);

      await db
        .update(timeEntries)
        .set({
          notionPageId,
          syncedAt: new Date(),
        })
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
