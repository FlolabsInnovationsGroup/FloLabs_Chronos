import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { timeEntries, timeEntryTags, projects, tags, users } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { deleteAndNotifyEntry, syncAndNotifyEntry } from "@/lib/entry-lifecycle";

const patchSchema = z.object({
  description: z.string().optional(),
  projectId: z.string().uuid().optional(),
  tagIds: z.array(z.string().uuid()).optional(),
  notionTaskPageId: z.string().optional().nullable(),
  notionTaskTitle: z.string().optional().nullable(),
  startedAt: z.string().datetime().optional(),
  stoppedAt: z.string().datetime().optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!db) return NextResponse.json({ error: "DB not available" }, { status: 503 });

  const { id } = await params;
  const [entry] = await db.select().from(timeEntries).where(eq(timeEntries.id, id)).limit(1);
  if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (entry.userId !== session.user.id && session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const {
    tagIds,
    startedAt: startedAtStr,
    stoppedAt: stoppedAtStr,
    notionTaskPageId,
    notionTaskTitle,
    ...entryFields
  } = parsed.data;

  const previousTagIds = await db
    .select({ tagId: timeEntryTags.tagId })
    .from(timeEntryTags)
    .where(eq(timeEntryTags.timeEntryId, id));
  const previousTagNames = previousTagIds.length > 0
    ? (await db.select({ name: tags.name }).from(tags).where(inArray(tags.id, previousTagIds.map((row) => row.tagId)))).map((row) => row.name)
    : [];
  const [previousProject] = await db.select({ name: projects.name }).from(projects).where(eq(projects.id, entry.projectId)).limit(1);

  if (startedAtStr !== undefined || stoppedAtStr !== undefined) {
    if (!entry.stoppedAt) {
      return NextResponse.json(
        { error: "Cannot edit times on an active timer" },
        { status: 400 }
      );
    }

    const newStartedAt = startedAtStr ? new Date(startedAtStr) : entry.startedAt;
    const newStoppedAt = stoppedAtStr ? new Date(stoppedAtStr) : entry.stoppedAt!;

    const startChanged = startedAtStr !== undefined && newStartedAt.getTime() !== entry.startedAt.getTime();
    const endChanged = stoppedAtStr !== undefined && newStoppedAt.getTime() !== entry.stoppedAt.getTime();

    if (startChanged && entry.editedField === "end") {
      return NextResponse.json(
        { error: "Cannot edit start: end was already edited for this entry" },
        { status: 400 }
      );
    }

    if (endChanged && entry.editedField === "start") {
      return NextResponse.json(
        { error: "Cannot edit end: start was already edited for this entry" },
        { status: 400 }
      );
    }

    if (startChanged && endChanged) {
      return NextResponse.json(
        { error: "Only one time boundary can be edited for an entry" },
        { status: 400 }
      );
    }

    if (newStoppedAt <= newStartedAt) {
      return NextResponse.json(
        { error: "End time must be after start time" },
        { status: 400 }
      );
    }

    const newDurationMs = newStoppedAt.getTime() - newStartedAt.getTime();
    const newEditedField = entry.editedField ?? (startChanged ? "start" : endChanged ? "end" : null);

    Object.assign(entryFields, {
      startedAt: newStartedAt,
      stoppedAt: newStoppedAt,
      durationMs: newDurationMs,
      ...(newEditedField ? { editedField: newEditedField } : {}),
    });
  }

  if (notionTaskPageId !== undefined) {
    Object.assign(entryFields, { notionTaskPageId });
  }
  if (notionTaskTitle !== undefined) {
    Object.assign(entryFields, { notionTaskTitle });
  }

  let updated = entry;
  if (Object.keys(entryFields).length > 0) {
    const [u] = await db
      .update(timeEntries)
      .set({ ...entryFields, updatedAt: new Date() })
      .where(eq(timeEntries.id, id))
      .returning();
    updated = u;
  }

  if (tagIds !== undefined) {
    await db.delete(timeEntryTags).where(eq(timeEntryTags.timeEntryId, id));
    if (tagIds.length > 0) {
      await db
        .insert(timeEntryTags)
        .values(tagIds.map((tagId) => ({ timeEntryId: id, tagId })))
        .onConflictDoNothing();
    }
  }

  const nextTagIds = tagIds ?? previousTagIds.map((row) => row.tagId);
  const nextTagNames = nextTagIds.length > 0
    ? (await db.select({ name: tags.name }).from(tags).where(inArray(tags.id, nextTagIds))).map((row) => row.name)
    : [];
  const [updatedProject] = await db.select({ name: projects.name }).from(projects).where(eq(projects.id, updated.projectId)).limit(1);

  const changes: Array<{ field: string; oldValue: string; newValue: string }> = [];
  if ((entry.description ?? "") !== (updated.description ?? "")) changes.push({ field: "description", oldValue: entry.description ?? "No description", newValue: updated.description ?? "No description" });
  if ((previousProject?.name ?? "Unknown") !== (updatedProject?.name ?? "Unknown")) changes.push({ field: "project", oldValue: previousProject?.name ?? "Unknown", newValue: updatedProject?.name ?? "Unknown" });
  if (previousTagNames.join(", ") !== nextTagNames.join(", ")) changes.push({ field: "tags", oldValue: previousTagNames.join(", ") || "No tags", newValue: nextTagNames.join(", ") || "No tags" });
  const previousTaskLabel = entry.notionTaskTitle?.trim() || "No task linked";
  const nextTaskLabel = updated.notionTaskTitle?.trim() || "No task linked";
  if ((entry.notionTaskPageId ?? null) !== (updated.notionTaskPageId ?? null) || previousTaskLabel !== nextTaskLabel) {
    changes.push({ field: "task", oldValue: previousTaskLabel, newValue: nextTaskLabel });
  }
  if ((entry.durationMs ?? 0) !== (updated.durationMs ?? 0)) changes.push({ field: "duration", oldValue: String(entry.durationMs ?? 0), newValue: String(updated.durationMs ?? 0) });
  if (new Date(entry.startedAt).getTime() !== new Date(updated.startedAt).getTime()) changes.push({ field: "startedAt", oldValue: new Date(entry.startedAt).toISOString(), newValue: new Date(updated.startedAt).toISOString() });
  if (entry.stoppedAt && updated.stoppedAt && new Date(entry.stoppedAt).getTime() !== new Date(updated.stoppedAt).getTime()) changes.push({ field: "stoppedAt", oldValue: new Date(entry.stoppedAt).toISOString(), newValue: new Date(updated.stoppedAt).toISOString() });

  if (updated.stoppedAt) {
    const syncResult = await syncAndNotifyEntry(updated.id, changes);
    if (!syncResult.synced) {
      return NextResponse.json(
        { error: `Entry updated locally, but Notion sync failed: ${syncResult.reason ?? "unknown"}` },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ entry: updated });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!db) return NextResponse.json({ error: "DB not available" }, { status: 503 });

  const { id } = await params;
  const [entry] = await db.select().from(timeEntries).where(eq(timeEntries.id, id)).limit(1);
  if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (entry.userId !== session.user.id && session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const tagRows = await db.select({ tagId: timeEntryTags.tagId }).from(timeEntryTags).where(eq(timeEntryTags.timeEntryId, id));
  const tagNames = tagRows.length > 0
    ? (await db.select({ name: tags.name }).from(tags).where(inArray(tags.id, tagRows.map((row) => row.tagId)))).map((row) => row.name)
    : [];
  const [projectRow] = await db.select({ name: projects.name }).from(projects).where(eq(projects.id, entry.projectId)).limit(1);
  const [userRow] = await db.select({ name: users.name, notionTeamMemberId: users.notionTeamMemberId }).from(users).where(eq(users.id, entry.userId)).limit(1);

  await db.delete(timeEntries).where(eq(timeEntries.id, id));

  await deleteAndNotifyEntry({
    notionPageId: entry.notionPageId,
    notionTeamMemberId: userRow?.notionTeamMemberId ?? null,
    userName: userRow?.name ?? "Unknown",
    project: projectRow?.name ?? "Unknown",
    tags: tagNames,
    description: entry.description ?? "",
    taskTitle: entry.notionTaskTitle ?? null,
    durationMs: entry.durationMs ?? 0,
    startedAt: new Date(entry.startedAt),
  }).catch(() => {});

  return NextResponse.json({ success: true });
}
