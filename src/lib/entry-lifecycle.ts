import { db } from "@/lib/db";
import { projects, tags, timeEntries, timeEntryTags, users } from "@/lib/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import {
  markEntryDeleted,
  resolveTeamMemberPageId,
  syncEntryToNotionFull,
  updateEntryStatus,
} from "@/lib/notion";
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
    })
    .from(timeEntries)
    .leftJoin(projects, eq(timeEntries.projectId, projects.id))
    .leftJoin(users, eq(timeEntries.userId, users.id))
    .where(eq(timeEntries.id, entryId))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  const tagRows = await db
    .select({ id: tags.id, name: tags.name })
    .from(timeEntryTags)
    .innerJoin(tags, eq(timeEntryTags.tagId, tags.id))
    .where(eq(timeEntryTags.timeEntryId, entryId));

  return {
    ...row.entry,
    project: row.project ?? undefined,
    user: row.user ?? undefined,
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
  const notionPageId = await syncEntryToNotionFull(entry as Parameters<typeof syncEntryToNotionFull>[0]);
  if (!notionPageId) return { synced: false, notified: false, reason: "notion-sync-failed" };

  await db
    .update(timeEntries)
    .set({ notionPageId, syncedAt: new Date() })
    .where(eq(timeEntries.id, entryId));

  const notionTeamMemberId = entry.user?.notionTeamMemberId || (entry.user?.name ? await resolveTeamMemberPageId(entry.user.name) : null);
  if (!notionTeamMemberId) return { synced: true, notified: false, reason: "team-member-unresolved" };

  const delivered = isNew
    ? await notifyEntryAdded({
        notionTeamMemberId,
        userName: entry.user?.name ?? "Unknown",
        project: entry.project?.name ?? "Unknown",
        tags: (entry.tags ?? []).map((tag) => tag.name),
        description: entry.description ?? "",
        durationMs: entry.durationMs ?? 0,
        startedAt: new Date(entry.startedAt),
        updatedAt: new Date(entry.updatedAt ?? entry.startedAt),
      })
    : await notifyEntryEdited({
        notionTeamMemberId,
        userName: entry.user?.name ?? "Unknown",
        project: entry.project?.name ?? "Unknown",
        tags: (entry.tags ?? []).map((tag) => tag.name),
        description: entry.description ?? "",
        durationMs: entry.durationMs ?? 0,
        startedAt: new Date(entry.startedAt),
        stoppedAt: entry.stoppedAt ? new Date(entry.stoppedAt) : null,
        updatedAt: new Date(entry.updatedAt ?? entry.startedAt),
        changes,
      });

  if (delivered) {
    await updateEntryStatus(notionPageId, "Notified");
  }

  return { synced: true, notified: delivered, notionPageId, reason: delivered ? undefined : "discord-send-failed" };
}

export async function deleteAndNotifyEntry(params: {
  notionPageId?: string | null;
  notionTeamMemberId?: string | null;
  userName: string;
  project: string;
  tags: string[];
  description: string;
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
