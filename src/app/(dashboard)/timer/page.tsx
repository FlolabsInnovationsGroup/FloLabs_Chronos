import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { timeEntries, projects, tags, users, timeEntryTags } from "@/lib/db/schema";
import { eq, and, gte, isNotNull, desc, inArray } from "drizzle-orm";
import { TimerDashboardClient } from "@/components/timer/TimerDashboardClient";
import type { Project, Tag, TimeEntry } from "@/types";

export const metadata: Metadata = { title: "Timer | FloLabs Chronos" };

async function getProjects(): Promise<Project[]> {
  if (!db) return [];
  const rows = await db
    .select()
    .from(projects)
    .where(eq(projects.archived, false))
    .orderBy(projects.name);
  return rows as Project[];
}

async function getUserTags(userId: string): Promise<Tag[]> {
  if (!db) return [];
  const rows = await db
    .select()
    .from(tags)
    .where(eq(tags.userId, userId))
    .orderBy(tags.name);
  return rows as Tag[];
}

async function buildEntriesWithTags(
  rows: { entry: typeof timeEntries.$inferSelect; project: typeof projects.$inferSelect | null; user: { id: string; name: string; email: string } | null }[]
): Promise<TimeEntry[]> {
  if (!db || rows.length === 0) return [];

  const entryIds = rows.map((r) => r.entry.id);
  const tagRows = await db
    .select({ timeEntryId: timeEntryTags.timeEntryId, tagId: tags.id, tagName: tags.name })
    .from(timeEntryTags)
    .innerJoin(tags, eq(timeEntryTags.tagId, tags.id))
    .where(inArray(timeEntryTags.timeEntryId, entryIds));

  const tagMap = new Map<string, { id: string; name: string }[]>();
  for (const r of tagRows) {
    const existing = tagMap.get(r.timeEntryId) ?? [];
    existing.push({ id: r.tagId, name: r.tagName });
    tagMap.set(r.timeEntryId, existing);
  }

  return rows.map(({ entry, project, user }) => ({
    ...entry,
    project: project ?? undefined,
    tags: tagMap.get(entry.id) ?? [],
    user: user ?? undefined,
  })) as TimeEntry[];
}

async function getTodayEntries(userId: string): Promise<TimeEntry[]> {
  if (!db) return [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const rows = await db
    .select({
      entry: timeEntries,
      project: projects,
      user: { id: users.id, name: users.name, email: users.email },
    })
    .from(timeEntries)
    .leftJoin(projects, eq(timeEntries.projectId, projects.id))
    .leftJoin(users, eq(timeEntries.userId, users.id))
    .where(and(eq(timeEntries.userId, userId), isNotNull(timeEntries.stoppedAt), gte(timeEntries.startedAt, today)))
    .orderBy(desc(timeEntries.startedAt))
    .limit(50);

  return buildEntriesWithTags(rows);
}

async function getRecentEntries(userId: string): Promise<TimeEntry[]> {
  if (!db) return [];

  const rows = await db
    .select({
      entry: timeEntries,
      project: projects,
      user: { id: users.id, name: users.name, email: users.email },
    })
    .from(timeEntries)
    .leftJoin(projects, eq(timeEntries.projectId, projects.id))
    .leftJoin(users, eq(timeEntries.userId, users.id))
    .where(and(eq(timeEntries.userId, userId), isNotNull(timeEntries.stoppedAt)))
    .orderBy(desc(timeEntries.startedAt))
    .limit(50);

  return buildEntriesWithTags(rows);
}

async function getUserWeeklyTarget(userId: string): Promise<number> {
  if (!db) return 40;
  const [row] = await db
    .select({ weeklyTargetHours: users.weeklyTargetHours })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row?.weeklyTargetHours ?? 40;
}

export default async function TimerPage() {
  const session = await auth();
  const userId = session!.user.id;

  const [projectsList, tagsList, todayEntries, recentEntries, weeklyTarget] = await Promise.all([
    getProjects(),
    getUserTags(userId),
    getTodayEntries(userId),
    getRecentEntries(userId),
    getUserWeeklyTarget(userId),
  ]);

  return (
    <div className="flex flex-col gap-10 max-w-6xl mx-auto">
      <TimerDashboardClient
        projects={projectsList}
        tags={tagsList}
        initialTodayEntries={todayEntries}
        initialRecentEntries={recentEntries}
        targetHours={weeklyTarget / 5}
      />
    </div>
  );
}
