import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getActiveTimer, setActiveTimer, broadcastTimerEvent } from "@/lib/redis";
import { db } from "@/lib/db";
import { timeEntries, timeEntryTags, tags } from "@/lib/db/schema";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";

const updateTimerSchema = z.object({
  tagIds: z.array(z.string().uuid()).default([]),
  description: z.string().optional(),
});

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const parsed = updateTimerSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const userId = session.user.id;
  const activeTimer = await getActiveTimer(userId);
  if (!activeTimer) return NextResponse.json({ error: "No active timer" }, { status: 404 });

  const requestedTagIds = [...new Set(parsed.data.tagIds)];
  const nextDescription = parsed.data.description;

  if (db && requestedTagIds.length > 0) {
    const ownedTags = await db
      .select({ id: tags.id })
      .from(tags)
      .where(and(eq(tags.userId, userId), inArray(tags.id, requestedTagIds)));

    if (ownedTags.length !== requestedTagIds.length) {
      return NextResponse.json({ error: "One or more tags are invalid" }, { status: 400 });
    }
  }

  const updatedTimer = {
    ...activeTimer,
    tagIds: requestedTagIds,
    ...(nextDescription !== undefined ? { description: nextDescription } : {}),
  };

  await setActiveTimer(userId, updatedTimer);

  if (db) {
    const runningEntries = await db
      .select({ id: timeEntries.id })
      .from(timeEntries)
      .where(and(eq(timeEntries.userId, userId), isNull(timeEntries.stoppedAt)))
      .orderBy(timeEntries.startedAt);

    const activeEntry = runningEntries[runningEntries.length - 1];

    if (activeEntry) {
      await db.delete(timeEntryTags).where(eq(timeEntryTags.timeEntryId, activeEntry.id));

      if (requestedTagIds.length > 0) {
        await db
          .insert(timeEntryTags)
          .values(requestedTagIds.map((tagId) => ({ timeEntryId: activeEntry.id, tagId })))
          .onConflictDoNothing();
      }

      if (nextDescription !== undefined) {
        await db
          .update(timeEntries)
          .set({ description: nextDescription, updatedAt: new Date() })
          .where(eq(timeEntries.id, activeEntry.id));
      }
    }
  }

  await broadcastTimerEvent({ type: "timer:start", userId, data: updatedTimer });

  return NextResponse.json({ ok: true, timer: updatedTimer });
}
