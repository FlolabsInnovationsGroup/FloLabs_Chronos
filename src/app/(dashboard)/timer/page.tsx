import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { timeEntries, projects, tags, users, timeEntryTags, entryDiscussions } from "@/lib/db/schema";
import { eq, and, gte, lte, isNotNull, desc, inArray, isNull, asc } from "drizzle-orm";
import { discussionReplies } from "@/lib/db/schema";
import { getCalendarWeekRangeLocal } from "@/lib/utils";
import { TimerDashboardClient } from "@/components/timer/TimerDashboardClient";
import { isAdmin, isTeamLead, getAccessibleUserIds } from "@/lib/permissions";
import type { Project, Tag, TimeEntry, EntryDiscussion } from "@/types";

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

async function getWeekEntries(userId: string): Promise<TimeEntry[]> {
  if (!db) return [];
  const { start, end } = getCalendarWeekRangeLocal(new Date());

  const rows = await db
    .select({
      entry: timeEntries,
      project: projects,
      user: { id: users.id, name: users.name, email: users.email },
    })
    .from(timeEntries)
    .leftJoin(projects, eq(timeEntries.projectId, projects.id))
    .leftJoin(users, eq(timeEntries.userId, users.id))
    .where(
      and(
        eq(timeEntries.userId, userId),
        isNotNull(timeEntries.stoppedAt),
        gte(timeEntries.startedAt, start),
        lte(timeEntries.startedAt, end)
      )
    )
    .orderBy(desc(timeEntries.startedAt))
    .limit(200);

  return buildEntriesWithTags(rows);
}

async function getRecentEntries(userId: string): Promise<TimeEntry[]> {
  if (!db) return [];
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const rows = await db
    .select({
      entry: timeEntries,
      project: projects,
      user: { id: users.id, name: users.name, email: users.email },
    })
    .from(timeEntries)
    .leftJoin(projects, eq(timeEntries.projectId, projects.id))
    .leftJoin(users, eq(timeEntries.userId, users.id))
    .where(and(eq(timeEntries.userId, userId), isNotNull(timeEntries.stoppedAt), gte(timeEntries.startedAt, sevenDaysAgo)))
    .orderBy(desc(timeEntries.startedAt))
    .limit(50);

  return buildEntriesWithTags(rows);
}

async function getInitialDiscussions(sessionUser: {
  id: string;
  role: import("@/types").Role;
  teamId: string | null;
  isActive: boolean;
}): Promise<EntryDiscussion[]> {
  if (!db) return [];

  const startedByAlias = users;

  type DiscussionRow = {
    discussion: typeof entryDiscussions.$inferSelect;
    startedBy: { id: string; name: string } | null;
    entry: { userId: string; description: string; projectId: string | null } | null;
    projectName: string | null;
  };

  let rows: DiscussionRow[];

  if (isAdmin(sessionUser)) {
    rows = await db
      .select({
        discussion: entryDiscussions,
        startedBy: { id: startedByAlias.id, name: startedByAlias.name },
        entry: { userId: timeEntries.userId, description: timeEntries.description, projectId: timeEntries.projectId },
        projectName: projects.name,
      })
      .from(entryDiscussions)
      .leftJoin(startedByAlias, eq(entryDiscussions.startedById, startedByAlias.id))
      .leftJoin(timeEntries, eq(entryDiscussions.entryId, timeEntries.id))
      .leftJoin(projects, eq(timeEntries.projectId, projects.id))
      .where(isNull(entryDiscussions.resolvedAt));
  } else if (isTeamLead(sessionUser)) {
    const accessibleUserIds = await getAccessibleUserIds(sessionUser);
    if (!accessibleUserIds || accessibleUserIds.length === 0) return [];

    const allRows = await db
      .select({
        discussion: entryDiscussions,
        startedBy: { id: startedByAlias.id, name: startedByAlias.name },
        entry: { userId: timeEntries.userId, description: timeEntries.description, projectId: timeEntries.projectId },
        projectName: projects.name,
      })
      .from(entryDiscussions)
      .leftJoin(startedByAlias, eq(entryDiscussions.startedById, startedByAlias.id))
      .leftJoin(timeEntries, eq(entryDiscussions.entryId, timeEntries.id))
      .leftJoin(projects, eq(timeEntries.projectId, projects.id))
      .where(isNull(entryDiscussions.resolvedAt));

    rows = allRows.filter(
      (r) =>
        r.discussion.startedById === sessionUser.id ||
        (r.entry?.userId && accessibleUserIds.includes(r.entry.userId))
    );
  } else {
    // Member: discussions on own entries
    const myEntries = await db
      .select({ id: timeEntries.id })
      .from(timeEntries)
      .where(eq(timeEntries.userId, sessionUser.id));

    if (myEntries.length === 0) return [];
    const myEntryIds = myEntries.map((e) => e.id);

    const allRows = await db
      .select({
        discussion: entryDiscussions,
        startedBy: { id: startedByAlias.id, name: startedByAlias.name },
        entry: { userId: timeEntries.userId, description: timeEntries.description, projectId: timeEntries.projectId },
        projectName: projects.name,
      })
      .from(entryDiscussions)
      .leftJoin(startedByAlias, eq(entryDiscussions.startedById, startedByAlias.id))
      .leftJoin(timeEntries, eq(entryDiscussions.entryId, timeEntries.id))
      .leftJoin(projects, eq(timeEntries.projectId, projects.id))
      .where(
        myEntryIds.length === 1
          ? eq(entryDiscussions.entryId, myEntryIds[0])
          : inArray(entryDiscussions.entryId, myEntryIds)
      );

    rows = allRows.filter((r) => r.discussion.resolvedAt === null);
  }

  const discussions = rows.map((r) => ({
    id: r.discussion.id,
    entryId: r.discussion.entryId,
    startedById: r.discussion.startedById,
    message: r.discussion.message,
    resolvedAt: r.discussion.resolvedAt,
    resolvedById: r.discussion.resolvedById,
    createdAt: r.discussion.createdAt!,
    updatedAt: r.discussion.updatedAt!,
    startedBy: r.startedBy ?? undefined,
    entryOwnerUserId: r.entry?.userId,
    entryDescription: r.entry?.description,
    entryProjectName: r.projectName ?? undefined,
    replies: [] as EntryDiscussion['replies'],
  }));

  // Fetch replies for all discussions
  const discussionIds = discussions.map((d) => d.id);
  if (discussionIds.length > 0) {
    const replyRows = await db
      .select({
        reply: discussionReplies,
        author: { id: users.id, name: users.name },
      })
      .from(discussionReplies)
      .leftJoin(users, eq(discussionReplies.authorId, users.id))
      .where(
        discussionIds.length === 1
          ? eq(discussionReplies.discussionId, discussionIds[0])
          : inArray(discussionReplies.discussionId, discussionIds)
      )
      .orderBy(asc(discussionReplies.createdAt));

    const repliesMap = new Map<string, EntryDiscussion['replies']>();
    for (const r of replyRows) {
      const existing = repliesMap.get(r.reply.discussionId) ?? [];
      existing.push({
        id: r.reply.id,
        discussionId: r.reply.discussionId,
        authorId: r.reply.authorId,
        message: r.reply.message,
        createdAt: r.reply.createdAt!,
        updatedAt: r.reply.updatedAt!,
        author: r.author ?? undefined,
      });
      repliesMap.set(r.reply.discussionId, existing);
    }
    for (const d of discussions) {
      d.replies = repliesMap.get(d.id) ?? [];
    }
  }

  return discussions;
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
  const sessionUser = session!.user;
  const userId = sessionUser.id;

  const [projectsList, tagsList, weekEntries, recentEntries, weeklyTarget, initialDiscussions] = await Promise.all([
    getProjects(),
    getUserTags(userId),
    getWeekEntries(userId),
    getRecentEntries(userId),
    getUserWeeklyTarget(userId),
    getInitialDiscussions(sessionUser),
  ]);

  return (
    <div className="flex flex-col gap-10 max-w-6xl mx-auto">
      <TimerDashboardClient
        projects={projectsList}
        tags={tagsList}
        initialWeekEntries={weekEntries}
        initialRecentEntries={recentEntries}
        weeklyTargetHours={weeklyTarget}
        initialDiscussions={initialDiscussions}
      />
    </div>
  );
}
