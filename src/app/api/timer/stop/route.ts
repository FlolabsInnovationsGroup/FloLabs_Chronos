import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getActiveTimer, deleteActiveTimer, broadcastTimerEvent } from "@/lib/redis";
import { db } from "@/lib/db";
import { timeEntries, timeEntryTags, users, projects } from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { z } from "zod";
import { sendDiscordEmbed, buildTimerStopEmbed } from "@/lib/discord";
import { syncAndNotifyEntry } from "@/lib/entry-lifecycle";
import { setNotionLinkedTaskInProgressOnStop } from "@/lib/notion";
import { getTimerStopValidation } from "@/lib/timer-rules";
import { chronosUserIdFromSessionUser } from "@/lib/chronos-session";

const stopSchema = z.object({ discard: z.boolean().optional() });

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const chronosUserId = chronosUserIdFromSessionUser(session.user);
  if (!chronosUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { discard } = stopSchema.parse(body);
  const userId = chronosUserId;

  const timer = await getActiveTimer(userId);
  if (!timer) return NextResponse.json({ error: "No active timer" }, { status: 404 });

  let timerForValidation = timer;
  if (db && timer.projectId) {
    const [project] = await db
      .select({ id: projects.id, requiresTaskOnStop: projects.requiresTaskOnStop })
      .from(projects)
      .where(eq(projects.id, timer.projectId))
      .limit(1);

    if (project) {
      timerForValidation = {
        ...timer,
        projectRequiresTaskOnStop: project.requiresTaskOnStop,
      };
    }
  }

  const stopValidation = getTimerStopValidation(timerForValidation);

  if (!discard && !stopValidation.canStop) {
    return NextResponse.json(
      { error: stopValidation.message, missing: stopValidation.missing },
      { status: 400 }
    );
  }

  const stoppedAt = Date.now();
  const durationMs = stoppedAt - timer.startedAt;

  await deleteActiveTimer(userId);

  if (db && !discard) {
    const runningEntries = await db
      .select({ id: timeEntries.id })
      .from(timeEntries)
      .where(and(eq(timeEntries.userId, userId), isNull(timeEntries.stoppedAt)))
      .orderBy(timeEntries.startedAt);

    const activeEntry = runningEntries[runningEntries.length - 1];

    const updated = activeEntry
      ? await db
          .update(timeEntries)
          .set({
            stoppedAt: new Date(stoppedAt),
            durationMs,
            projectId: timer.projectId ?? null,
            description: timer.description,
            notionTaskPageId: timer.notionTaskPageId ?? null,
            notionTaskTitle: timer.notionTaskTitle ?? null,
            updatedAt: new Date(stoppedAt),
          })
          .where(eq(timeEntries.id, activeEntry.id))
          .returning()
      : [];

    const tagIds: string[] = Array.isArray(timer.tagIds) ? timer.tagIds : [];
    if (tagIds.length > 0 && updated.length > 0) {
      const entryId = updated[0].id;
      await db
        .insert(timeEntryTags)
        .values(tagIds.map((tagId) => ({ timeEntryId: entryId, tagId })))
        .onConflictDoNothing();
    }

    if (updated[0]?.id) {
      await syncAndNotifyEntry(updated[0].id).catch(() => {});
    }
    const linkedTaskId = timer.notionTaskPageId?.trim();
    if (linkedTaskId) {
      void setNotionLinkedTaskInProgressOnStop(linkedTaskId).catch(() => {});
    }
  } else if (db && discard) {
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

  if (!discard) {
    (async () => {
      if (!db) return;
      const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (user[0]?.discordWebhookUrl && user[0]?.notifyOnStop) {
        const project = timer.projectId
          ? await db
              .select()
              .from(projects)
              .where(eq(projects.id, timer.projectId))
              .limit(1)
          : [];
        await sendDiscordEmbed(
          user[0].discordWebhookUrl,
          buildTimerStopEmbed(
            user[0].name,
            project[0]?.name ?? "No project",
            timer.description,
            durationMs
          )
        );
      }
    })().catch(() => {});
  }

  return NextResponse.json({ ok: true, durationMs });
}
