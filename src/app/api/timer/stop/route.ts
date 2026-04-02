import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getActiveTimer, deleteActiveTimer, broadcastTimerEvent } from "@/lib/redis";
import { db } from "@/lib/db";
import { timeEntries, timeEntryTags, users, projects, tags } from "@/lib/db/schema";
import { eq, and, isNull, inArray } from "drizzle-orm";
import { z } from "zod";
import { sendDiscordEmbed, buildTimerStopEmbed, notifyEntryAdded } from "@/lib/discord";

const stopSchema = z.object({ discard: z.boolean().optional() });

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { discard } = stopSchema.parse(body);
  const userId = session.user.id;

  const timer = await getActiveTimer(userId);
  if (!timer) return NextResponse.json({ error: "No active timer" }, { status: 404 });

  if (!discard && !timer.description.trim()) {
    return NextResponse.json(
      { error: "Add a description before stopping the timer" },
      { status: 400 }
    );
  }

  const stoppedAt = Date.now();
  const durationMs = stoppedAt - timer.startedAt;

  await deleteActiveTimer(userId);

  if (db && !discard) {
    // Update the running entry
    const updated = await db
      .update(timeEntries)
      .set({
        stoppedAt: new Date(stoppedAt),
        durationMs,
        updatedAt: new Date(stoppedAt),
      })
      .where(
        and(
          eq(timeEntries.userId, userId),
          eq(timeEntries.projectId, timer.projectId),
          isNull(timeEntries.stoppedAt)
        )
      )
      .returning({ id: timeEntries.id, startedAt: timeEntries.startedAt, description: timeEntries.description, updatedAt: timeEntries.updatedAt });

    // Insert tag associations for the completed entry
    const tagIds: string[] = Array.isArray(timer.tagIds) ? timer.tagIds : [];
    if (tagIds.length > 0 && updated.length > 0) {
      const entryId = updated[0].id;
      await db
        .insert(timeEntryTags)
        .values(tagIds.map((tagId) => ({ timeEntryId: entryId, tagId })))
        .onConflictDoNothing();
    }

    if (updated[0]) {
      const tagNames = tagIds.length > 0
        ? (await db.select({ name: tags.name }).from(tags).where(inArray(tags.id, tagIds))).map((row) => row.name)
        : [];
      const [user] = await db.select({ name: users.name, notionTeamMemberId: users.notionTeamMemberId }).from(users).where(eq(users.id, userId)).limit(1);
      const [project] = await db.select({ name: projects.name }).from(projects).where(eq(projects.id, timer.projectId)).limit(1);
      if (user?.notionTeamMemberId) {
        void notifyEntryAdded({
          notionTeamMemberId: user.notionTeamMemberId,
          userName: user.name,
          project: project?.name ?? "Unknown",
          tags: tagNames,
          description: updated[0].description ?? timer.description ?? "",
          durationMs,
          startedAt: new Date(updated[0].startedAt),
          updatedAt: new Date(updated[0].updatedAt ?? stoppedAt),
        }).catch(() => {});
      }
    }
  } else if (db && discard) {
    // Delete the running entry (timeEntryTags cascade automatically)
    await db
      .delete(timeEntries)
      .where(
        and(
          eq(timeEntries.userId, userId),
          isNull(timeEntries.stoppedAt)
        )
      );
  }

  await broadcastTimerEvent({ type: "timer:stop", userId, data: null });

  // Fire Discord stop notification fire-and-forget
  if (!discard) {
    (async () => {
      if (!db) return;
      const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (user[0]?.discordWebhookUrl && user[0]?.notifyOnStop) {
        const project = await db
          .select()
          .from(projects)
          .where(eq(projects.id, timer.projectId))
          .limit(1);
        await sendDiscordEmbed(
          user[0].discordWebhookUrl,
          buildTimerStopEmbed(
            user[0].name,
            project[0]?.name ?? "Unknown",
            timer.description,
            durationMs
          )
        );
      }
    })().catch(() => {});
  }

  return NextResponse.json({ ok: true, durationMs });
}
