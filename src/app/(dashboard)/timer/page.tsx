import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { timeEntries, projects, tags, users } from "@/lib/db/schema";
import { eq, and, gte, isNotNull, desc } from "drizzle-orm";
import { TimerDisplay } from "@/components/timer/TimerDisplay";
import { TimerControls } from "@/components/timer/TimerControls";
import { ActiveTimerCard } from "@/components/timer/ActiveTimerCard";
import { EntryList } from "@/components/entries/EntryList";
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

async function getTags(): Promise<Tag[]> {
  if (!db) return [];
  const rows = await db.select().from(tags).orderBy(tags.name);
  return rows as Tag[];
}

async function getTodayEntries(userId: string): Promise<TimeEntry[]> {
  if (!db) return [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const rows = await db
    .select({
      entry: timeEntries,
      project: projects,
      tag: tags,
      user: { id: users.id, name: users.name, email: users.email },
    })
    .from(timeEntries)
    .leftJoin(projects, eq(timeEntries.projectId, projects.id))
    .leftJoin(tags, eq(timeEntries.tagId, tags.id))
    .leftJoin(users, eq(timeEntries.userId, users.id))
    .where(
      and(
        eq(timeEntries.userId, userId),
        isNotNull(timeEntries.stoppedAt),
        gte(timeEntries.startedAt, today)
      )
    )
    .orderBy(desc(timeEntries.startedAt))
    .limit(50);

  return rows.map(({ entry, project, tag, user }) => ({
    ...entry,
    project: project ?? undefined,
    tag: tag ?? null,
    user: user ?? undefined,
  })) as TimeEntry[];
}

async function getRecentEntries(userId: string): Promise<TimeEntry[]> {
  if (!db) return [];

  const rows = await db
    .select({
      entry: timeEntries,
      project: projects,
      tag: tags,
      user: { id: users.id, name: users.name, email: users.email },
    })
    .from(timeEntries)
    .leftJoin(projects, eq(timeEntries.projectId, projects.id))
    .leftJoin(tags, eq(timeEntries.tagId, tags.id))
    .leftJoin(users, eq(timeEntries.userId, users.id))
    .where(and(eq(timeEntries.userId, userId), isNotNull(timeEntries.stoppedAt)))
    .orderBy(desc(timeEntries.startedAt))
    .limit(50);

  return rows.map(({ entry, project, tag, user }) => ({
    ...entry,
    project: project ?? undefined,
    tag: tag ?? null,
    user: user ?? undefined,
  })) as TimeEntry[];
}

export default async function TimerPage() {
  const session = await auth();
  const userId = session!.user.id;

  const [projectsList, tagsList, todayEntries, recentEntries] = await Promise.all([
    getProjects(),
    getTags(),
    getTodayEntries(userId),
    getRecentEntries(userId),
  ]);

  return (
    <div className="flex flex-col gap-10 max-w-6xl mx-auto">
      {/* Top section: timer + daily momentum */}
      <div className="grid grid-cols-12 gap-8">
        {/* Left: timer display + controls */}
        <div className="col-span-12 md:col-span-7 flex flex-col gap-8">
          <TimerDisplay />
          <TimerControls projects={projectsList} tags={tagsList} />
        </div>

        {/* Right: active timer card */}
        <div className="col-span-12 md:col-span-5">
          <ActiveTimerCard todayEntries={todayEntries} targetHours={8} />
        </div>
      </div>

      {/* Recent entries */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2
            className="text-lg font-medium text-[#31332f]"
            style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
          >
            Recent Sessions
          </h2>
          <span
            className="text-sm text-[#b2b2ad]"
            style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
          >
            {recentEntries.length} entries
          </span>
        </div>
        <EntryList
          entries={recentEntries}
          emptyMessage="No sessions yet. Start your first one above."
        />
      </div>
    </div>
  );
}
