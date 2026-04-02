import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { timeEntries, projects, tags, users, timeEntryTags } from "@/lib/db/schema";
import { eq, and, gte, lte, desc, inArray, isNotNull, type SQL } from "drizzle-orm";
import { z } from "zod";
import { getAccessibleUserIds } from "@/lib/permissions";
import { notifyEntryAdded } from "@/lib/discord";

// Given a list of entry rows, fetch and attach tags from the join table.
async function attachTags(
  entryRows: { id: string }[]
): Promise<Map<string, { id: string; name: string }[]>> {
  const map = new Map<string, { id: string; name: string }[]>();
  if (!db || entryRows.length === 0) return map;

  const entryIds = entryRows.map((e) => e.id);
  const rows = await db
    .select({ timeEntryId: timeEntryTags.timeEntryId, tagId: tags.id, tagName: tags.name })
    .from(timeEntryTags)
    .innerJoin(tags, eq(timeEntryTags.tagId, tags.id))
    .where(inArray(timeEntryTags.timeEntryId, entryIds));

  for (const r of rows) {
    const existing = map.get(r.timeEntryId) ?? [];
    existing.push({ id: r.tagId, name: r.tagName });
    map.set(r.timeEntryId, existing);
  }
  return map;
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!db) return NextResponse.json({ entries: [] });

  const url = new URL(req.url);
  const limit = parseInt(url.searchParams.get("limit") ?? "50");
  const requestedUserId = url.searchParams.get("userId");
  const accessibleUserIds = await getAccessibleUserIds(session.user);

  const conditions: SQL[] = [isNotNull(timeEntries.stoppedAt)];

  if (accessibleUserIds !== null) {
    if (requestedUserId && !accessibleUserIds.includes(requestedUserId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (requestedUserId) {
      conditions.push(eq(timeEntries.userId, requestedUserId));
    } else if (accessibleUserIds.length === 1) {
      conditions.push(eq(timeEntries.userId, accessibleUserIds[0]));
    } else {
      conditions.push(inArray(timeEntries.userId, accessibleUserIds));
    }
  } else if (requestedUserId) {
    conditions.push(eq(timeEntries.userId, requestedUserId));
  }

  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (from) conditions.push(gte(timeEntries.startedAt, new Date(from)));
  if (to) conditions.push(lte(timeEntries.startedAt, new Date(to)));

  const rows = await db
    .select({
      entry: timeEntries,
      project: projects,
      user: { id: users.id, name: users.name, email: users.email },
    })
    .from(timeEntries)
    .leftJoin(projects, eq(timeEntries.projectId, projects.id))
    .leftJoin(users, eq(timeEntries.userId, users.id))
    .where(and(...conditions))
    .orderBy(desc(timeEntries.startedAt))
    .limit(limit);

  const tagMap = await attachTags(rows.map((r) => r.entry));

  const entries = rows.map(({ entry, project, user }) => ({
    ...entry,
    project,
    user,
    tags: tagMap.get(entry.id) ?? [],
  }));

  return NextResponse.json({ entries });
}

const createSchema = z.object({
  projectId: z.string().uuid(),
  tagIds: z.array(z.string().uuid()).optional().default([]),
  description: z.string(),
  startedAt: z.string(),
  stoppedAt: z.string(),
  durationMs: z.number(),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!db) return NextResponse.json({ error: "DB not available" }, { status: 503 });

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const { tagIds, ...rest } = parsed.data;

  const [entry] = await db
    .insert(timeEntries)
    .values({
      userId: session.user.id,
      ...rest,
      startedAt: new Date(rest.startedAt),
      stoppedAt: new Date(rest.stoppedAt),
    })
    .returning();

  if (tagIds.length > 0) {
    await db
      .insert(timeEntryTags)
      .values(tagIds.map((tagId) => ({ timeEntryId: entry.id, tagId })))
      .onConflictDoNothing();
  }

  const createdTagMap = await attachTags([{ id: entry.id }]);
  const createdTags = createdTagMap.get(entry.id) ?? [];

  const [projectRow] = await db.select({ name: projects.name }).from(projects).where(eq(projects.id, entry.projectId)).limit(1);
  const [userRow] = await db
    .select({ name: users.name, notionTeamMemberId: users.notionTeamMemberId })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  if (entry.stoppedAt && userRow?.notionTeamMemberId) {
    void notifyEntryAdded({
      notionTeamMemberId: userRow.notionTeamMemberId,
      userName: userRow.name,
      project: projectRow?.name ?? "Unknown",
      tags: createdTags.map((tag) => tag.name),
      description: entry.description ?? "",
      durationMs: entry.durationMs ?? 0,
      startedAt: new Date(entry.startedAt),
      updatedAt: new Date(entry.updatedAt ?? entry.startedAt),
    }).catch(() => {});
  }

  return NextResponse.json({ entry: { ...entry, tags: createdTags } }, { status: 201 });
}
