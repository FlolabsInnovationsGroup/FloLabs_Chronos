import { setActiveTimer } from "@/lib/redis";
import { db } from "@/lib/db";
import { timeEntries, projects, timeEntryTags } from "@/lib/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import type { ActiveTimer } from "@/types";

/**
 * Reconstructs an active timer from the running time_entries row when Redis is empty
 * (e.g. after an App Runner redeploy). Re-populates Redis so subsequent calls are fast.
 * Tag IDs are restored from the time_entry_tags join table.
 */
export async function restoreTimerFromDb(
  userId: string,
  applicantId: string | null
): Promise<ActiveTimer | null> {
  if (!db) return null;

  const queryUserId = applicantId ?? userId;
  const [entry] = await db
    .select({
      id: timeEntries.id,
      userId: timeEntries.userId,
      projectId: timeEntries.projectId,
      description: timeEntries.description,
      notionTaskPageId: timeEntries.notionTaskPageId,
      notionTaskTitle: timeEntries.notionTaskTitle,
      startedAt: timeEntries.startedAt,
    })
    .from(timeEntries)
    .where(and(eq(timeEntries.userId, queryUserId), isNull(timeEntries.stoppedAt)))
    .orderBy(timeEntries.startedAt)
    .limit(1);

  if (!entry) return null;

  let projectName: string | null = null;
  let projectRequiresTaskOnStop = false;
  if (entry.projectId) {
    const [project] = await db
      .select({ name: projects.name, requiresTaskOnStop: projects.requiresTaskOnStop })
      .from(projects)
      .where(eq(projects.id, entry.projectId))
      .limit(1);
    if (project) {
      projectName = project.name;
      projectRequiresTaskOnStop = project.requiresTaskOnStop;
    }
  }

  const tagRows = await db
    .select({ tagId: timeEntryTags.tagId })
    .from(timeEntryTags)
    .where(eq(timeEntryTags.timeEntryId, entry.id));

  const timer: ActiveTimer = {
    userId,
    projectId: entry.projectId ?? null,
    projectName,
    projectRequiresTaskOnStop,
    tagIds: tagRows.map((r) => r.tagId),
    description: entry.description,
    notionTaskPageId: entry.notionTaskPageId ?? null,
    notionTaskTitle: entry.notionTaskTitle ?? null,
    startedAt: entry.startedAt.getTime(),
  };

  await setActiveTimer(userId, timer);
  return timer;
}
