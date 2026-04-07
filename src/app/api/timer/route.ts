import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getActiveTimer, setActiveTimer, broadcastTimerEvent } from "@/lib/redis";
import { db } from "@/lib/db";
import { projects, timeEntries, timeEntryTags, tags } from "@/lib/db/schema";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";

const updateTimerSchema = z.object({
  projectId: z.string().uuid().optional().nullable(),
  tagIds: z.array(z.string().uuid()).default([]),
  description: z.string().optional(),
  notionTaskPageId: z.string().optional().nullable(),
  notionTaskTitle: z.string().optional().nullable(),
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

  const requestedProjectId = parsed.data.projectId;
  const requestedTagIds = [...new Set(parsed.data.tagIds)];
  const nextDescription = parsed.data.description;
  const nextTaskPageId = parsed.data.notionTaskPageId;
  const nextTaskTitle = parsed.data.notionTaskTitle;

  let selectedProject: { id: string; requiresTaskOnStop: boolean; name: string } | null = null;
  if (db && requestedProjectId) {
    const [ownedProject] = await db
      .select({ id: projects.id, requiresTaskOnStop: projects.requiresTaskOnStop, name: projects.name })
      .from(projects)
      .where(eq(projects.id, requestedProjectId))
      .limit(1);

    if (!ownedProject) {
      return NextResponse.json({ error: "Project not found" }, { status: 400 });
    }

    selectedProject = ownedProject;
  }

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
    ...(requestedProjectId !== undefined ? { projectId: requestedProjectId } : {}),
    ...(requestedProjectId !== undefined
      ? {
          projectRequiresTaskOnStop: selectedProject?.requiresTaskOnStop ?? false,
          projectName: requestedProjectId ? (selectedProject?.name ?? null) : null,
        }
      : {}),
    tagIds: requestedTagIds,
    ...(nextDescription !== undefined ? { description: nextDescription } : {}),
    ...(nextTaskPageId !== undefined ? { notionTaskPageId: nextTaskPageId } : {}),
    ...(nextTaskTitle !== undefined ? { notionTaskTitle: nextTaskTitle } : {}),
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

      const updateFields: Record<string, unknown> = { updatedAt: new Date() };
      if (requestedProjectId !== undefined) updateFields.projectId = requestedProjectId;
      if (nextDescription !== undefined) updateFields.description = nextDescription;
      if (nextTaskPageId !== undefined) updateFields.notionTaskPageId = nextTaskPageId;
      if (nextTaskTitle !== undefined) updateFields.notionTaskTitle = nextTaskTitle;

      await db.update(timeEntries).set(updateFields).where(eq(timeEntries.id, activeEntry.id));
    }
  }

  await broadcastTimerEvent({ type: "timer:start", userId, data: updatedTimer });

  return NextResponse.json({ ok: true, timer: updatedTimer });
}
