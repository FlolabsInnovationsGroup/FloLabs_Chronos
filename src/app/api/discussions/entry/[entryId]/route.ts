import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { entryDiscussions, timeEntries, users, projects } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import { canViewDiscussions } from "@/lib/permissions";
import { fetchRepliesForDiscussions } from "@/app/api/discussions/[id]/replies/route";
import type { EntryDiscussion } from "@/types";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ entryId: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!db) return NextResponse.json({ discussions: [] });

  const { entryId } = await params;
  const viewer = session.user;

  const [entry] = await db.select().from(timeEntries).where(eq(timeEntries.id, entryId)).limit(1);
  if (!entry) return NextResponse.json({ error: "Entry not found" }, { status: 404 });

  const allowed = await canViewDiscussions(viewer, entry.userId);
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const rows = await db
    .select({
      discussion: entryDiscussions,
      startedBy: { id: users.id, name: users.name },
    })
    .from(entryDiscussions)
    .leftJoin(users, eq(entryDiscussions.startedById, users.id))
    .where(eq(entryDiscussions.entryId, entryId))
    .orderBy(asc(entryDiscussions.createdAt));

  // Fetch project name if needed
  let projectName: string | undefined;
  if (entry.projectId) {
    const [proj] = await db.select({ name: projects.name }).from(projects).where(eq(projects.id, entry.projectId)).limit(1);
    projectName = proj?.name;
  }

  // Collect resolvedBy ids and fetch names
  const resolvedByIds = [...new Set(
    rows.map((r) => r.discussion.resolvedById).filter((id): id is string => id !== null)
  )];
  const resolvedByMap = new Map<string, string>();
  for (const rbId of resolvedByIds) {
    const [u] = await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, rbId)).limit(1);
    if (u) resolvedByMap.set(u.id, u.name);
  }

  const discussions: EntryDiscussion[] = rows.map((r) => ({
    id: r.discussion.id,
    entryId: r.discussion.entryId,
    startedById: r.discussion.startedById,
    message: r.discussion.message,
    resolvedAt: r.discussion.resolvedAt,
    resolvedById: r.discussion.resolvedById,
    createdAt: r.discussion.createdAt!,
    updatedAt: r.discussion.updatedAt!,
    startedBy: r.startedBy ?? undefined,
    resolvedBy: r.discussion.resolvedById
      ? { id: r.discussion.resolvedById, name: resolvedByMap.get(r.discussion.resolvedById) ?? '' }
      : null,
    entryOwnerUserId: entry.userId,
    entryDescription: entry.description,
    entryProjectName: projectName,
  }));

  const repliesMap = await fetchRepliesForDiscussions(discussions.map((d) => d.id));
  for (const d of discussions) {
    d.replies = repliesMap.get(d.id) ?? [];
  }

  return NextResponse.json({ discussions });
}
