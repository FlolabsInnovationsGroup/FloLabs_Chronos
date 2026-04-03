import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { projects, tags, timeEntries, timeEntryTags } from "@/lib/db/schema";
import { and, desc, eq, gte, ilike, inArray, isNotNull, or } from "drizzle-orm";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ suggestions: [] }, { status: 401 });
  if (!db) return NextResponse.json({ suggestions: [] });

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

  const conditions = [
    eq(timeEntries.userId, session.user.id),
    isNotNull(timeEntries.stoppedAt),
    gte(timeEntries.startedAt, since),
  ];

  if (q) {
    const pattern = `%${q}%`;
    const entryIdsMatchingTag = db
      .select({ id: timeEntryTags.timeEntryId })
      .from(timeEntryTags)
      .innerJoin(tags, eq(timeEntryTags.tagId, tags.id))
      .where(ilike(tags.name, pattern));

    conditions.push(
      or(
        ilike(timeEntries.description, pattern),
        ilike(projects.name, pattern),
        ilike(timeEntries.notionTaskTitle, pattern),
        inArray(timeEntries.id, entryIdsMatchingTag),
      )!
    );
  }

  const rows = await db
    .select({
      entry: timeEntries,
      project: { id: projects.id, name: projects.name },
    })
    .from(timeEntries)
    .leftJoin(projects, eq(timeEntries.projectId, projects.id))
    .where(and(...conditions))
    .orderBy(desc(timeEntries.startedAt))
    .limit(q ? 8 : 5);

  const entryIds = rows.map((row) => row.entry.id);
  const tagRows = entryIds.length > 0
    ? await db
        .select({ timeEntryId: timeEntryTags.timeEntryId, id: tags.id, name: tags.name })
        .from(timeEntryTags)
        .innerJoin(tags, eq(timeEntryTags.tagId, tags.id))
        .where(inArray(timeEntryTags.timeEntryId, entryIds))
    : [];

  const tagMap = new Map<string, { id: string; name: string }[]>();
  for (const row of tagRows) {
    const list = tagMap.get(row.timeEntryId) ?? [];
    list.push({ id: row.id, name: row.name });
    tagMap.set(row.timeEntryId, list);
  }

  const deduped = new Map<string, {
    entryId: string;
    description: string;
    projectId: string;
    projectName: string;
    tagIds: string[];
    tagNames: string[];
    notionTaskPageId: string | null;
    notionTaskTitle: string | null;
    startedAt: string;
  }>();

  for (const row of rows) {
    const tagList = tagMap.get(row.entry.id) ?? [];
    const key = [
      (row.entry.description ?? "").trim().toLowerCase(),
      row.entry.projectId,
      tagList.map((t) => t.id).sort().join(","),
      row.entry.notionTaskPageId ?? "",
    ].join("::");

    if (deduped.has(key)) continue;

    deduped.set(key, {
      entryId: row.entry.id,
      description: row.entry.description ?? "",
      projectId: row.entry.projectId,
      projectName: row.project?.name ?? "Unknown",
      tagIds: tagList.map((t) => t.id),
      tagNames: tagList.map((t) => t.name),
      notionTaskPageId: row.entry.notionTaskPageId ?? null,
      notionTaskTitle: row.entry.notionTaskTitle ?? null,
      startedAt: new Date(row.entry.startedAt).toISOString(),
    });
  }

  return NextResponse.json({ suggestions: Array.from(deduped.values()) });
}
