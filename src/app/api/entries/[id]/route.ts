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

  const { tagIds, startedAt: startedAtStr, stoppedAt: stoppedAtStr, ...entryFields } = parsed.data;

  // Enforce editedField lock for start/end time edits
  if (startedAtStr !== undefined || stoppedAtStr !== undefined) {
    // Active timers (no stoppedAt) cannot have start/end edited
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

  // Update the entry row if there are non-tag fields to change
  let updated = entry;
  if (Object.keys(entryFields).length > 0) {
    const [u] = await db
      .update(timeEntries)
      .set({ ...entryFields, updatedAt: new Date() })
      .where(eq(timeEntries.id, id))
      .returning();
    updated = u;
  }

  // Replace tags if provided
  if (tagIds !== undefined) {
    await db.delete(timeEntryTags).where(eq(timeEntryTags.timeEntryId, id));
    if (tagIds.length > 0) {
      await db
        .insert(timeEntryTags)
        .values(tagIds.map((tagId) => ({ timeEntryId: id, tagId })))
        .onConflictDoNothing();
    }
  }

  if (updated.stoppedAt) {
    await syncAndNotifyEntry(updated.id).catch(() => {});
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

  // timeEntryTags rows cascade-delete automatically
  await db.delete(timeEntries).where(eq(timeEntries.id, id));

  await deleteAndNotifyEntry({
    notionPageId: entry.notionPageId,
    notionTeamMemberId: userRow?.notionTeamMemberId ?? null,
    userName: userRow?.name ?? "Unknown",
    project: projectRow?.name ?? "Unknown",
    tags: tagNames,
    description: entry.description ?? "",
    durationMs: entry.durationMs ?? 0,
    startedAt: new Date(entry.startedAt),
  }).catch(() => {});

  return NextResponse.json({ success: true });
}
