import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { timeEntries, timeEntryTags, projects, tags, users } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { notifyEntryDeleted, notifyEntryEdited } from "@/lib/discord";

const patchSchema = z.object({
  description: z.string().optional(),
  projectId: z.string().uuid().optional(),
  tagIds: z.array(z.string().uuid()).optional(),
  startedAt: z.string().datetime().optional(),
  stoppedAt: z.string().datetime().optional(),
});

async function loadTagNames(tagIds: string[]) {
  if (!db || tagIds.length === 0) return [] as string[];
  const rows = await db.select({ name: tags.name }).from(tags).where(inArray(tags.id, tagIds));
  return rows.map((row) => row.name);
}

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

  const previousTagIds = await db
    .select({ tagId: timeEntryTags.tagId })
    .from(timeEntryTags)
    .where(eq(timeEntryTags.timeEntryId, id));
  const previousTagNames = await loadTagNames(previousTagIds.map((row) => row.tagId));
  const [previousProject] = await db.select({ name: projects.name }).from(projects).where(eq(projects.id, entry.projectId)).limit(1);
  const [entryUser] = await db
    .select({ name: users.name, notionTeamMemberId: users.notionTeamMemberId })
    .from(users)
    .where(eq(users.id, entry.userId))
    .limit(1);

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

  const nextTagIds = tagIds ?? previousTagIds.map((row) => row.tagId);
  const nextTagNames = await loadTagNames(nextTagIds);
  const [updatedProject] = await db.select({ name: projects.name }).from(projects).where(eq(projects.id, updated.projectId)).limit(1);

  const changes: Array<{ field: string; oldValue: string; newValue: string }> = [];
  if ((entry.description ?? "") !== (updated.description ?? "")) changes.push({ field: "description", oldValue: entry.description ?? "", newValue: updated.description ?? "" });
  if ((previousProject?.name ?? "Unknown") !== (updatedProject?.name ?? "Unknown")) changes.push({ field: "project", oldValue: previousProject?.name ?? "Unknown", newValue: updatedProject?.name ?? "Unknown" });
  if (previousTagNames.join(", ") !== nextTagNames.join(", ")) changes.push({ field: "tags", oldValue: previousTagNames.join(", ") || "No tags", newValue: nextTagNames.join(", ") || "No tags" });
  if ((entry.durationMs ?? 0) !== (updated.durationMs ?? 0)) changes.push({ field: "duration", oldValue: String(entry.durationMs ?? 0), newValue: String(updated.durationMs ?? 0) });
  if (new Date(entry.startedAt).getTime() !== new Date(updated.startedAt).getTime()) changes.push({ field: "startedAt", oldValue: new Date(entry.startedAt).toISOString(), newValue: new Date(updated.startedAt).toISOString() });
  if (entry.stoppedAt && updated.stoppedAt && new Date(entry.stoppedAt).getTime() !== new Date(updated.stoppedAt).getTime()) changes.push({ field: "stoppedAt", oldValue: new Date(entry.stoppedAt).toISOString(), newValue: new Date(updated.stoppedAt).toISOString() });

  if (changes.length > 0 && entryUser?.notionTeamMemberId) {
    void notifyEntryEdited({
      notionTeamMemberId: entryUser.notionTeamMemberId,
      userName: entryUser.name,
      project: updatedProject?.name ?? "Unknown",
      tags: nextTagNames,
      description: updated.description ?? "",
      durationMs: updated.durationMs ?? 0,
      startedAt: new Date(updated.startedAt),
      stoppedAt: updated.stoppedAt ? new Date(updated.stoppedAt) : null,
      updatedAt: new Date(updated.updatedAt ?? new Date()),
      changes,
    }).catch(() => {});
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
  const tagNames = await loadTagNames(tagRows.map((row) => row.tagId));
  const [projectRow] = await db.select({ name: projects.name }).from(projects).where(eq(projects.id, entry.projectId)).limit(1);
  const [entryUser] = await db
    .select({ name: users.name, notionTeamMemberId: users.notionTeamMemberId })
    .from(users)
    .where(eq(users.id, entry.userId))
    .limit(1);

  // timeEntryTags rows cascade-delete automatically
  await db.delete(timeEntries).where(eq(timeEntries.id, id));

  if (entryUser?.notionTeamMemberId) {
    void notifyEntryDeleted({
      notionTeamMemberId: entryUser.notionTeamMemberId,
      userName: entryUser.name,
      project: projectRow?.name ?? "Unknown",
      tags: tagNames,
      description: entry.description ?? "",
      durationMs: entry.durationMs ?? 0,
      startedAt: new Date(entry.startedAt),
      deletedAt: new Date(),
    }).catch(() => {});
  }

  return NextResponse.json({ success: true });
}
