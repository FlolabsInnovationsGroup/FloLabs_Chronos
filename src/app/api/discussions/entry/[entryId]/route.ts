import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { entryDiscussions, timeEntries, projects } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import { canViewDiscussions } from "@/lib/permissions";
import { fetchRepliesForDiscussions } from "@/app/api/discussions/[id]/replies/route";
import type { EntryDiscussion } from "@/types";
import { chronosActorDisplay } from "@/lib/chronos-user-notion";

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
    })
    .from(entryDiscussions)
    .where(eq(entryDiscussions.entryId, entryId))
    .orderBy(asc(entryDiscussions.createdAt));

  // Fetch project name if needed
  let projectName: string | undefined;
  if (entry.projectId) {
    const [proj] = await db.select({ name: projects.name }).from(projects).where(eq(projects.id, entry.projectId)).limit(1);
    projectName = proj?.name;
  }

  const actorKeys = rows.flatMap((r) => [
    { userId: r.discussion.startedById, applicantId: r.discussion.startedByApplicantId ?? null },
    r.discussion.resolvedById
      ? { userId: r.discussion.resolvedById, applicantId: r.discussion.resolvedByApplicantId ?? null }
      : null,
  ]).filter((v): v is { userId: string; applicantId: string | null } => Boolean(v));

  const actorMap = new Map<string, { id: string; name: string } | null>();
  await Promise.all(
    actorKeys.map(async ({ userId, applicantId }) => {
      const key = `${userId}:${applicantId ?? ""}`;
      if (actorMap.has(key)) return;
      actorMap.set(key, await chronosActorDisplay(userId, applicantId));
    })
  );

  const discussions: EntryDiscussion[] = rows.map((r) => ({
    id: r.discussion.id,
    entryId: r.discussion.entryId,
    startedById: r.discussion.startedById,
    startedByApplicantId: r.discussion.startedByApplicantId,
    message: r.discussion.message,
    resolvedAt: r.discussion.resolvedAt,
    resolvedById: r.discussion.resolvedById,
    resolvedByApplicantId: r.discussion.resolvedByApplicantId,
    createdAt: r.discussion.createdAt!,
    updatedAt: r.discussion.updatedAt!,
    startedBy: actorMap.get(`${r.discussion.startedById}:${r.discussion.startedByApplicantId ?? ""}`) ?? undefined,
    resolvedBy: r.discussion.resolvedById
      ? (actorMap.get(`${r.discussion.resolvedById}:${r.discussion.resolvedByApplicantId ?? ""}`) ?? null)
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
