import { setActiveTimer } from "@/lib/redis";
import { db } from "@/lib/db";
import { timeEntries, projects, timeEntryTags } from "@/lib/db/schema";
import { and, eq, isNull, lt, sql } from "drizzle-orm";
import { whereTimeEntriesForLinkedUser } from "@/lib/time-entry-applicant";
import type { ActiveTimer } from "@/types";

// Entries open longer than this are orphaned (crash / deploy with no stop call).
// They are closed automatically rather than surfaced as active timers.
const STALE_TIMER_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Reconstructs an active timer from the running time_entries row when Redis is empty
 * (e.g. after an App Runner redeploy). Re-populates Redis so subsequent calls are fast.
 *
 * Entries older than STALE_TIMER_THRESHOLD_MS are treated as orphaned: closed in the DB
 * with durationMs=0 so they don't block the user with an unstoppable relic.
 */
export async function restoreTimerFromDb(
  userId: string,
  applicantId: string | null
): Promise<ActiveTimer | null> {
  if (!db) return null;

  const staleThreshold = new Date(Date.now() - STALE_TIMER_THRESHOLD_MS);

  // Close orphaned entries that have been open for > 24 hours
  await db
    .update(timeEntries)
    .set({
      stoppedAt: timeEntries.startedAt,
      durationMs: 0,
      updatedAt: sql`now()`,
    })
    .where(
      and(
        whereTimeEntriesForLinkedUser(userId, applicantId),
        isNull(timeEntries.stoppedAt),
        lt(timeEntries.startedAt, staleThreshold)
      )
    );

  // Now look for a recent running entry (started within the last 24 hours)
  const [entry] = await db
    .select({
      id: timeEntries.id,
      projectId: timeEntries.projectId,
      description: timeEntries.description,
      notionTaskPageId: timeEntries.notionTaskPageId,
      notionTaskTitle: timeEntries.notionTaskTitle,
      startedAt: timeEntries.startedAt,
    })
    .from(timeEntries)
    .where(
      and(
        whereTimeEntriesForLinkedUser(userId, applicantId),
        isNull(timeEntries.stoppedAt)
      )
    )
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
