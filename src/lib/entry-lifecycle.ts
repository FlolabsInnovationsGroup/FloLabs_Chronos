import { db } from "@/lib/db";
import { applicants, projects, tags, timeEntries, timeEntryTags, users } from "@/lib/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { markEntryDeleted, syncEntryToNotionFull, updateEntryStatus } from "@/lib/notion";
import {
  notifyEntryAdded,
  notifyEntryDeleted,
  notifyEntryEdited,
} from "@/lib/discord";

async function loadEntry(entryId: string) {
  if (!db) return null;

  const rows = await db
    .select({
      entry: timeEntries,
      project: { name: projects.name },
      user: {
        name: users.name,
        email: users.email,
        notionTeamMemberId: users.notionTeamMemberId,
      },
      applicantName: applicants.name,
      applicantNotionTeamMemberId: applicants.notionTeamMemberId,
    })
    .from(timeEntries)
    .leftJoin(projects, eq(timeEntries.projectId, projects.id))
    .leftJoin(users, eq(timeEntries.userId, users.id))
    .leftJoin(applicants, eq(applicants.chronosUserId, users.id))
    .where(eq(timeEntries.id, entryId))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  const resolvedName = row.applicantName?.trim() || row.user?.name;
  const resolvedNotion =
    row.applicantNotionTeamMemberId?.trim() || row.user?.notionTeamMemberId?.trim() || null;
  const userPayload = row.user
    ? {
        ...row.user,
        name: resolvedName ?? row.user.name,
        notionTeamMemberId: resolvedNotion,
      }
    : undefined;

  const tagRows = await db
    .select({ id: tags.id, name: tags.name })
    .from(timeEntryTags)
    .innerJoin(tags, eq(timeEntryTags.tagId, tags.id))
    .where(eq(timeEntryTags.timeEntryId, entryId));

  return {
    ...row.entry,
    project: row.project ?? undefined,
    user: userPayload,
    tags: tagRows,
  };
}

export async function syncAndNotifyEntry(
  entryId: string,
  changes: Array<{ field: string; oldValue: string; newValue: string }> = []
) {
  if (!db) return { synced: false, notified: false, reason: "db-unavailable" };

  const entry = await loadEntry(entryId);
  if (!entry || !entry.stoppedAt) return { synced: false, notified: false, reason: "entry-missing-or-running" };

  const isNew = !entry.notionPageId;
  let notionPageId: string | null = null;
  try {
    notionPageId = await syncEntryToNotionFull(entry as Parameters<typeof syncEntryToNotionFull>[0]);
  } catch (error) {
    return {
      synced: false,
      notified: false,
      reason: error instanceof Error ? error.message : "notion-sync-failed",
    };
  }
  if (!notionPageId) return { synced: false, notified: false, reason: "notion-sync-failed" };

  await db
    .update(timeEntries)
    .set({ notionPageId, syncedAt: new Date() })
    .where(eq(timeEntries.id, entryId));

  const notionTeamMemberId = entry.user?.notionTeamMemberId?.trim() || null;
  if (!notionTeamMemberId) {
    await updateEntryStatus(notionPageId, "Processed").catch(() => {});
    return { synced: true, notified: false, notionPageId, reason: "queued-no-team-member" };
  }

  let delivered = false;
  try {
    delivered = isNew
      ? await notifyEntryAdded({
          notionTeamMemberId,
          userName: entry.user?.name ?? "Unknown",
          project: entry.project?.name ?? "No project",
          tags: (entry.tags ?? []).map((tag) => tag.name),
          description: entry.description ?? "",
          taskTitle: entry.notionTaskTitle ?? null,
          durationMs: entry.durationMs ?? 0,
          startedAt: new Date(entry.startedAt),
          updatedAt: new Date(entry.updatedAt ?? entry.startedAt),
        })
      : await notifyEntryEdited({
          notionTeamMemberId,
          userName: entry.user?.name ?? "Unknown",
          project: entry.project?.name ?? "No project",
          tags: (entry.tags ?? []).map((tag) => tag.name),
          description: entry.description ?? "",
          taskTitle: entry.notionTaskTitle ?? null,
          durationMs: entry.durationMs ?? 0,
          startedAt: new Date(entry.startedAt),
          stoppedAt: entry.stoppedAt ? new Date(entry.stoppedAt) : null,
          updatedAt: new Date(entry.updatedAt ?? entry.startedAt),
          changes,
        });
  } catch {
    await updateEntryStatus(notionPageId, "Processed").catch(() => {});
    return { synced: true, notified: false, notionPageId, reason: "queued-no-webhook" };
  }

  if (delivered) {
    await updateEntryStatus(notionPageId, "Notified");
  } else {
    await updateEntryStatus(notionPageId, "Processed").catch(() => {});
  }

  return { synced: true, notified: delivered, notionPageId, reason: delivered ? undefined : "queued-no-webhook" };
}

export async function deleteAndNotifyEntry(params: {
  notionPageId?: string | null;
  notionTeamMemberId?: string | null;
  userName: string;
  project: string;
  tags: string[];
  description: string;
  taskTitle?: string | null;
  durationMs: number;
  startedAt: Date;
}) {
  if (params.notionPageId) {
    await markEntryDeleted(params.notionPageId);
  }

  const delivered = params.notionTeamMemberId
    ? await notifyEntryDeleted({
        notionTeamMemberId: params.notionTeamMemberId,
        userName: params.userName,
        project: params.project,
        tags: params.tags,
        description: params.description,
        taskTitle: params.taskTitle ?? null,
        durationMs: params.durationMs,
        startedAt: params.startedAt,
        deletedAt: new Date(),
      })
    : false;

  if (delivered && params.notionPageId) {
    await updateEntryStatus(params.notionPageId, "Notified");
  }

  return { deleted: true, notified: delivered };
}
