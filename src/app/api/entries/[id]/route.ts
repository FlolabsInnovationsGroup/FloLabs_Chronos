import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { timeEntries, timeEntryTags, projects, tags } from "@/lib/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { whereTagsForLinkedUser } from "@/lib/tag-applicant";
import { z } from "zod";
import { deleteAndNotifyEntry, syncAndNotifyEntry } from "@/lib/entry-lifecycle";
import { canManageTimeEntry } from "@/lib/permissions";
import { chronosUserDisplayAndNotionTeamMemberId } from "@/lib/chronos-user-notion";
import { resolveApplicantIdForTimeEntryWrite } from "@/lib/time-entry-applicant";

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

  if (!(await canManageTimeEntry(session.user, entry.userId))) {
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
  const [previousProject] = entry.projectId
    ? await db.select({ name: projects.name }).from(projects).where(eq(projects.id, entry.projectId)).limit(1)
    : [];

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
    const applicantId = await resolveApplicantIdForTimeEntryWrite(session.user, entry.userId);
    const [u] = await db
      .update(timeEntries)
      .set({
        ...entryFields,
        ...(applicantId ? { applicantId } : {}),
        updatedAt: new Date(),
      })
      .where(eq(timeEntries.id, id))
      .returning();
    updated = u;
  } else if (tagIds !== undefined) {
    const applicantId = await resolveApplicantIdForTimeEntryWrite(session.user, entry.userId);
    if (applicantId) {
      const [u] = await db
        .update(timeEntries)
        .set({ applicantId, updatedAt: new Date() })
        .where(eq(timeEntries.id, id))
        .returning();
      updated = u;
    }
  }

  if (tagIds !== undefined) {
    const nextIds = tagIds.length > 0 ? [...new Set(tagIds)] : [];
    if (nextIds.length > 0) {
      const valid = await db
        .select({ id: tags.id })
        .from(tags)
        .where(
          and(
            whereTagsForLinkedUser(entry.userId, entry.applicantId ?? null),
            inArray(tags.id, nextIds)
          )
        );
      if (valid.length !== nextIds.length) {
        return NextResponse.json({ error: "One or more tags are invalid" }, { status: 400 });
      }
    }
    await db.delete(timeEntryTags).where(eq(timeEntryTags.timeEntryId, id));
    if (nextIds.length > 0) {
      await db
        .insert(timeEntryTags)
        .values(nextIds.map((tagId) => ({ timeEntryId: id, tagId })))
        .onConflictDoNothing();
    }
  }

  const nextTagIds =
    tagIds !== undefined
      ? tagIds.length > 0
        ? [...new Set(tagIds)]
        : []
      : previousTagIds.map((row) => row.tagId);
  const nextTagNames = nextTagIds.length > 0
    ? (await db.select({ name: tags.name }).from(tags).where(inArray(tags.id, nextTagIds))).map((row) => row.name)
    : [];
  const [updatedProject] = updated.projectId
    ? await db.select({ name: projects.name }).from(projects).where(eq(projects.id, updated.projectId)).limit(1)
    : [];

  const changes: Array<{ field: string; oldValue: string; newValue: string }> = [];
  if ((entry.description ?? "") !== (updated.description ?? "")) changes.push({ field: "description", oldValue: entry.description ?? "No description", newValue: updated.description ?? "No description" });
  if ((previousProject?.name ?? "No project") !== (updatedProject?.name ?? "No project")) changes.push({ field: "project", oldValue: previousProject?.name ?? "No project", newValue: updatedProject?.name ?? "No project" });
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
    if (!syncResult.notified) {
      return NextResponse.json(
        { error: `Entry synced to Notion, but Discord notification failed: ${syncResult.reason ?? "unknown"}` },
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

  if (!(await canManageTimeEntry(session.user, entry.userId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const tagRows = await db.select({ tagId: timeEntryTags.tagId }).from(timeEntryTags).where(eq(timeEntryTags.timeEntryId, id));
  const tagNames = tagRows.length > 0
    ? (await db.select({ name: tags.name }).from(tags).where(inArray(tags.id, tagRows.map((row) => row.tagId)))).map((row) => row.name)
    : [];
  const [projectRow] = entry.projectId
    ? await db.select({ name: projects.name }).from(projects).where(eq(projects.id, entry.projectId)).limit(1)
    : [];
  const profile = await chronosUserDisplayAndNotionTeamMemberId(entry.userId);

  await db.delete(timeEntries).where(eq(timeEntries.id, id));

  await deleteAndNotifyEntry({
    notionPageId: entry.notionPageId,
    notionTeamMemberId: profile?.notionTeamMemberId ?? null,
    userName: profile?.name ?? "Unknown",
    project: projectRow?.name ?? "No project",
    tags: tagNames,
    description: entry.description ?? "",
    taskTitle: entry.notionTaskTitle ?? null,
    durationMs: entry.durationMs ?? 0,
    startedAt: new Date(entry.startedAt),
  }).catch(() => {});

  return NextResponse.json({ success: true });
}
