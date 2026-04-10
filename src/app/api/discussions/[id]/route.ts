import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { entryDiscussions, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { isAdmin, canResolveDiscussion } from "@/lib/permissions";
import { broadcastDiscussionChange } from "@/lib/realtime";
import type { EntryDiscussion } from "@/types";

const patchSchema = z.object({
  resolved: z.literal(true),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  const { id } = await params;
  const viewer = session.user;

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const [discussion] = await db.select().from(entryDiscussions).where(eq(entryDiscussions.id, id)).limit(1);
  if (!discussion) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!canResolveDiscussion(viewer, discussion)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [updated] = await db
    .update(entryDiscussions)
    .set({ resolvedAt: new Date(), resolvedById: viewer.id, updatedAt: new Date() })
    .where(eq(entryDiscussions.id, id))
    .returning();

  broadcastDiscussionChange(updated.entryId);

  // Load startedBy for response
  const [startedByUser] = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(eq(users.id, updated.startedById))
    .limit(1);

  const result: EntryDiscussion = {
    id: updated.id,
    entryId: updated.entryId,
    startedById: updated.startedById,
    message: updated.message,
    resolvedAt: updated.resolvedAt,
    resolvedById: updated.resolvedById,
    createdAt: updated.createdAt!,
    updatedAt: updated.updatedAt!,
    startedBy: startedByUser ?? undefined,
  };

  return NextResponse.json({ discussion: result });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  const { id } = await params;
  const viewer = session.user;

  const [discussion] = await db.select().from(entryDiscussions).where(eq(entryDiscussions.id, id)).limit(1);
  if (!discussion) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Admin can always delete; starter can delete if unresolved
  const canDelete = isAdmin(viewer) || (viewer.id === discussion.startedById && discussion.resolvedAt === null);
  if (!canDelete) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await db.delete(entryDiscussions).where(eq(entryDiscussions.id, id));

  broadcastDiscussionChange(discussion.entryId);

  return NextResponse.json({ ok: true });
}
