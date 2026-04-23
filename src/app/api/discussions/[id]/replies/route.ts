import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { entryDiscussions, discussionReplies, timeEntries } from "@/lib/db/schema";
import { eq, asc, inArray } from "drizzle-orm";
import { canViewDiscussions, isAdmin } from "@/lib/permissions";
import { broadcastDiscussionChange } from "@/lib/realtime";
import type { DiscussionReply } from "@/types";
import { applicantIdForSessionLinkedUser, chronosUserIdFromSessionUser } from "@/lib/chronos-session";
import { chronosActorDisplay, chronosActorDisplayMap } from "@/lib/chronos-user-notion";

function toReply(
  row: typeof discussionReplies.$inferSelect,
  author: { id: string; name: string } | null
): DiscussionReply {
  return {
    id: row.id,
    discussionId: row.discussionId,
    authorId: row.authorId,
    authorApplicantId: row.authorApplicantId,
    message: row.message,
    createdAt: row.createdAt!,
    updatedAt: row.updatedAt!,
    author: author ?? undefined,
  };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!db) return NextResponse.json({ replies: [] });

  const { id } = await params;
  const viewer = session.user;
  const viewerChronosId = chronosUserIdFromSessionUser(viewer);
  if (!isAdmin(viewer) && !viewerChronosId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [discussion] = await db
    .select()
    .from(entryDiscussions)
    .where(eq(entryDiscussions.id, id))
    .limit(1);
  if (!discussion) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [entry] = await db
    .select({ userId: timeEntries.userId })
    .from(timeEntries)
    .where(eq(timeEntries.id, discussion.entryId))
    .limit(1);
  if (!entry) return NextResponse.json({ error: "Entry not found" }, { status: 404 });

  const allowed = await canViewDiscussions(viewer, entry.userId);
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const rows = await db
    .select({ reply: discussionReplies })
    .from(discussionReplies)
    .where(eq(discussionReplies.discussionId, id))
    .orderBy(asc(discussionReplies.createdAt));

  const authorMap = await chronosActorDisplayMap(
    rows.map((r) => ({ userId: r.reply.authorId, applicantId: r.reply.authorApplicantId ?? null }))
  );
  const replies: DiscussionReply[] = rows.map((r) =>
    toReply(r.reply, authorMap.get(`${r.reply.authorId}:${r.reply.authorApplicantId ?? ""}`) ?? null)
  );

  return NextResponse.json({ replies });
}

const postSchema = z.object({
  message: z.string().min(1),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  const { id } = await params;
  const viewer = session.user;
  const viewerChronosId = chronosUserIdFromSessionUser(viewer);
  if (!viewerChronosId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const [discussion] = await db
    .select()
    .from(entryDiscussions)
    .where(eq(entryDiscussions.id, id))
    .limit(1);
  if (!discussion) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [entry] = await db
    .select({ userId: timeEntries.userId })
    .from(timeEntries)
    .where(eq(timeEntries.id, discussion.entryId))
    .limit(1);
  if (!entry) return NextResponse.json({ error: "Entry not found" }, { status: 404 });

  const allowed = await canViewDiscussions(viewer, entry.userId);
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const authorApplicantId = applicantIdForSessionLinkedUser(viewer);
  const [inserted] = await db
    .insert(discussionReplies)
    .values({
      discussionId: id,
      authorId: viewerChronosId,
      authorApplicantId,
      message: parsed.data.message,
    })
    .returning();

  broadcastDiscussionChange(discussion.entryId);

  const author = await chronosActorDisplay(viewerChronosId, authorApplicantId);
  const reply: DiscussionReply = toReply(inserted, author ?? null);

  return NextResponse.json({ reply }, { status: 201 });
}

/**
 * Helper exported for use by other API routes: fetch all replies for a set of discussion ids
 * and return them grouped by discussionId.
 */
export async function fetchRepliesForDiscussions(
  discussionIds: string[]
): Promise<Map<string, DiscussionReply[]>> {
  const map = new Map<string, DiscussionReply[]>();
  if (!db || discussionIds.length === 0) return map;

  const rows = await db
    .select({ reply: discussionReplies })
    .from(discussionReplies)
    .where(
      discussionIds.length === 1
        ? eq(discussionReplies.discussionId, discussionIds[0])
        : inArray(discussionReplies.discussionId, discussionIds)
    )
    .orderBy(asc(discussionReplies.createdAt));

  const authorMap = await chronosActorDisplayMap(
    rows.map((r) => ({ userId: r.reply.authorId, applicantId: r.reply.authorApplicantId ?? null }))
  );

  for (const r of rows) {
    const existing = map.get(r.reply.discussionId) ?? [];
    existing.push(toReply(r.reply, authorMap.get(`${r.reply.authorId}:${r.reply.authorApplicantId ?? ""}`) ?? null));
    map.set(r.reply.discussionId, existing);
  }

  return map;
}
