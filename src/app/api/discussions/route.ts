import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { entryDiscussions, timeEntries, users, projects } from "@/lib/db/schema";
import { eq, isNull, inArray } from "drizzle-orm";
import {
  isAdmin,
  isTeamLead,
  canStartDiscussion,
  getAccessibleUserIds,
} from "@/lib/permissions";
import { broadcastDiscussionChange } from "@/lib/realtime";
import { fetchRepliesForDiscussions } from "@/app/api/discussions/[id]/replies/route";
import type { EntryDiscussion } from "@/types";
import { chronosUserIdFromSessionUser } from "@/lib/chronos-session";

function toDiscussion(row: {
  discussion: typeof entryDiscussions.$inferSelect;
  startedBy: { id: string; name: string } | null;
  entry: { userId: string; description: string; projectId: string | null } | null;
  projectName: string | null;
}): EntryDiscussion {
  return {
    id: row.discussion.id,
    entryId: row.discussion.entryId,
    startedById: row.discussion.startedById,
    message: row.discussion.message,
    resolvedAt: row.discussion.resolvedAt,
    resolvedById: row.discussion.resolvedById,
    createdAt: row.discussion.createdAt!,
    updatedAt: row.discussion.updatedAt!,
    startedBy: row.startedBy ?? undefined,
    entryOwnerUserId: row.entry?.userId,
    entryDescription: row.entry?.description,
    entryProjectName: row.projectName ?? undefined,
  };
}

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!db) return NextResponse.json({ discussions: [] });

  const viewer = session.user;
  const viewerChronosId = chronosUserIdFromSessionUser(viewer);
  if (!isAdmin(viewer) && !viewerChronosId) {
    return NextResponse.json({ discussions: [] });
  }

  // Build query for unresolved discussions visible to this viewer
  const startedByAlias = users;

  // We need to join: entry_discussions -> time_entries -> projects -> users(startedBy)
  // For simplicity, fetch all unresolved then filter by access
  let rows: {
    discussion: typeof entryDiscussions.$inferSelect;
    startedBy: { id: string; name: string } | null;
    entry: { userId: string; description: string; projectId: string | null } | null;
    projectName: string | null;
  }[];

  if (isAdmin(viewer)) {
    rows = await db
      .select({
        discussion: entryDiscussions,
        startedBy: { id: startedByAlias.id, name: startedByAlias.name },
        entry: { userId: timeEntries.userId, description: timeEntries.description, projectId: timeEntries.projectId },
        projectName: projects.name,
      })
      .from(entryDiscussions)
      .leftJoin(startedByAlias, eq(entryDiscussions.startedById, startedByAlias.id))
      .leftJoin(timeEntries, eq(entryDiscussions.entryId, timeEntries.id))
      .leftJoin(projects, eq(timeEntries.projectId, projects.id))
      .where(isNull(entryDiscussions.resolvedAt));
  } else if (isTeamLead(viewer)) {
    const accessibleUserIds = await getAccessibleUserIds(viewer);
    if (!accessibleUserIds || accessibleUserIds.length === 0) {
      return NextResponse.json({ discussions: [] });
    }
    rows = await db
      .select({
        discussion: entryDiscussions,
        startedBy: { id: startedByAlias.id, name: startedByAlias.name },
        entry: { userId: timeEntries.userId, description: timeEntries.description, projectId: timeEntries.projectId },
        projectName: projects.name,
      })
      .from(entryDiscussions)
      .leftJoin(startedByAlias, eq(entryDiscussions.startedById, startedByAlias.id))
      .leftJoin(timeEntries, eq(entryDiscussions.entryId, timeEntries.id))
      .leftJoin(projects, eq(timeEntries.projectId, projects.id))
      .where(isNull(entryDiscussions.resolvedAt));

    // Filter: started by viewer OR entry owner is in accessible scope
    rows = rows.filter(
      (r) =>
        (viewerChronosId && r.discussion.startedById === viewerChronosId) ||
        (r.entry?.userId && accessibleUserIds.includes(r.entry.userId))
    );
  } else {
    // Member: only discussions on their own entries
    if (!viewerChronosId) return NextResponse.json({ discussions: [] });
    const myEntries = await db
      .select({ id: timeEntries.id })
      .from(timeEntries)
      .where(eq(timeEntries.userId, viewerChronosId));

    if (myEntries.length === 0) return NextResponse.json({ discussions: [] });

    const myEntryIds = myEntries.map((e) => e.id);

    rows = await db
      .select({
        discussion: entryDiscussions,
        startedBy: { id: startedByAlias.id, name: startedByAlias.name },
        entry: { userId: timeEntries.userId, description: timeEntries.description, projectId: timeEntries.projectId },
        projectName: projects.name,
      })
      .from(entryDiscussions)
      .leftJoin(startedByAlias, eq(entryDiscussions.startedById, startedByAlias.id))
      .leftJoin(timeEntries, eq(entryDiscussions.entryId, timeEntries.id))
      .leftJoin(projects, eq(timeEntries.projectId, projects.id))
      .where(
        myEntryIds.length === 1
          ? eq(entryDiscussions.entryId, myEntryIds[0])
          : inArray(entryDiscussions.entryId, myEntryIds)
      );

    rows = rows.filter((r) => r.discussion.resolvedAt === null);
  }

  const discussions = rows.map(toDiscussion);

  const repliesMap = await fetchRepliesForDiscussions(discussions.map((d) => d.id));
  for (const d of discussions) {
    d.replies = repliesMap.get(d.id) ?? [];
  }

  return NextResponse.json({ discussions });
}

const postSchema = z.object({
  entryId: z.string().uuid(),
  message: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  const body = await req.json();
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const { entryId, message } = parsed.data;
  const viewer = session.user;
  const viewerChronosId = chronosUserIdFromSessionUser(viewer);
  if (!viewerChronosId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Load entry to check ownership
  const [entry] = await db.select().from(timeEntries).where(eq(timeEntries.id, entryId)).limit(1);
  if (!entry) return NextResponse.json({ error: "Entry not found" }, { status: 404 });

  const allowed = await canStartDiscussion(viewer, entry.userId);
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [discussion] = await db
    .insert(entryDiscussions)
    .values({ entryId, startedById: viewerChronosId, message })
    .returning();

  broadcastDiscussionChange(entryId);

  // Load startedBy for response
  const [startedByUser] = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(eq(users.id, viewerChronosId))
    .limit(1);

  const [project] = entry.projectId
    ? await db.select({ name: projects.name }).from(projects).where(eq(projects.id, entry.projectId)).limit(1)
    : [null];

  const result: EntryDiscussion = {
    id: discussion.id,
    entryId: discussion.entryId,
    startedById: discussion.startedById,
    message: discussion.message,
    resolvedAt: discussion.resolvedAt,
    resolvedById: discussion.resolvedById,
    createdAt: discussion.createdAt!,
    updatedAt: discussion.updatedAt!,
    startedBy: startedByUser ?? undefined,
    entryOwnerUserId: entry.userId,
    entryDescription: entry.description,
    entryProjectName: project?.name ?? undefined,
  };

  return NextResponse.json({ discussion: result }, { status: 201 });
}
