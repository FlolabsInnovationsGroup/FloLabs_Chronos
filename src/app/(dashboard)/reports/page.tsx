import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { timeEntries, projects, tags, users, timeEntryTags, applicants } from "@/lib/db/schema";
import {
  eq,
  and,
  gte,
  lte,
  isNotNull,
  desc,
  ilike,
  inArray,
  or,
  type SQL,
} from "drizzle-orm";
import { ReportFilters } from "@/components/reports/ReportFilters";
import { ReportChart } from "@/components/reports/ReportChart";
import { ReportTable } from "@/components/reports/ReportTable";
import { ReportEntries } from "@/components/reports/ReportEntries";
import { ExportCSVButton } from "@/components/reports/ExportCSVButton";
import { Suspense } from "react";
import type { Project, Tag, ReportRow, TimeEntry } from "@/types";
import {
  getAccessibleUserIds,
  getAccessibleUsers,
  isAdmin as userIsAdmin,
  isTeamLead as userIsTeamLead,
} from "@/lib/permissions";
import { applicantIdForSessionLinkedUser, requireChronosUserIdFromSessionUser, resolveChronosUserIdForSessionUser } from "@/lib/chronos-session";
import { whereTagsForLinkedUser } from "@/lib/tag-applicant";
import { whereTimeEntriesForLinkedUser } from "@/lib/time-entry-applicant";
import { chronosEntryOwnerDisplayMap } from "@/lib/chronos-user-notion";

export const metadata: Metadata = { title: "Reports | FloLabs Chronos" };

interface SearchParams {
  from?: string;
  to?: string;
  userId?: string;
  projectId?: string;
  tagId?: string;
  search?: string;
  groupBy?: string;
  limit?: string;
}

async function getFilterData(
  sessionUser: {
    id: string;
    role: import("@/types").Role;
    teamId: string | null;
    isActive: boolean;
  },
  ownerChronosUserId: string,
  linkedApplicantId: string | null
) {
  if (!db) return { projects: [], tags: [], users: [] };

  const isAdmin = userIsAdmin(sessionUser);
  const isTeamLead = userIsTeamLead(sessionUser);
  const accessibleUserIds = await getAccessibleUserIds(sessionUser);

  const tagQuery =
    isAdmin
      ? db.select().from(tags).orderBy(tags.name)
      : isTeamLead && accessibleUserIds !== null && accessibleUserIds.length > 0
        ? db.select().from(tags).where(inArray(tags.userId, accessibleUserIds)).orderBy(tags.name)
        : db
            .select()
            .from(tags)
            .where(whereTagsForLinkedUser(ownerChronosUserId, linkedApplicantId))
            .orderBy(tags.name);

  const [projectRows, tagRows, userRows] = await Promise.all([
    db.select().from(projects).where(eq(projects.archived, false)).orderBy(projects.name),
    tagQuery,
    getAccessibleUsers(sessionUser),
  ]);

  return {
    projects: projectRows as Project[],
    tags: tagRows as Tag[],
    users: (isAdmin || isTeamLead ? userRows : []) as import("@/types").User[],
  };
}

async function getEntries(
  params: SearchParams,
  sessionUser: {
    id: string;
    role: import("@/types").Role;
    teamId: string | null;
    isActive: boolean;
  },
  ownerChronosUserId: string,
  linkedApplicantId: string | null
): Promise<TimeEntry[]> {
  if (!db) return [];

  const conditions: SQL[] = [isNotNull(timeEntries.stoppedAt)];
  const accessibleUserIds = await getAccessibleUserIds(sessionUser);

  if (accessibleUserIds !== null) {
    if (params.userId && !accessibleUserIds.includes(params.userId)) return [];
    if (params.userId) {
      conditions.push(
        params.userId === ownerChronosUserId
          ? whereTimeEntriesForLinkedUser(ownerChronosUserId, linkedApplicantId)
          : eq(timeEntries.userId, params.userId)
      );
    } else if (accessibleUserIds.length === 1 && accessibleUserIds[0] === ownerChronosUserId) {
      conditions.push(whereTimeEntriesForLinkedUser(ownerChronosUserId, linkedApplicantId));
    } else if (accessibleUserIds.length === 1) {
      conditions.push(eq(timeEntries.userId, accessibleUserIds[0]));
    } else {
      conditions.push(inArray(timeEntries.userId, accessibleUserIds));
    }
  } else if (params.userId) {
    conditions.push(
      params.userId === ownerChronosUserId
        ? whereTimeEntriesForLinkedUser(ownerChronosUserId, linkedApplicantId)
        : eq(timeEntries.userId, params.userId)
    );
  }

  if (params.from) conditions.push(gte(timeEntries.startedAt, new Date(params.from)));
  if (params.to) {
    const toDate = new Date(params.to);
    toDate.setHours(23, 59, 59, 999);
    conditions.push(lte(timeEntries.startedAt, toDate));
  }
  if (params.projectId) conditions.push(eq(timeEntries.projectId, params.projectId));

  // Tag filter via join table
  if (params.tagId) {
    const entryIdsWithTag = db
      .select({ id: timeEntryTags.timeEntryId })
      .from(timeEntryTags)
      .where(eq(timeEntryTags.tagId, params.tagId));
    conditions.push(inArray(timeEntries.id, entryIdsWithTag));
  }

  // Search via description, project name, applicant/user name/email, or tag name
  if (params.search) {
    const pattern = `%${params.search}%`;
    const entryIdsMatchingTag = db
      .select({ id: timeEntryTags.timeEntryId })
      .from(timeEntryTags)
      .innerJoin(tags, eq(timeEntryTags.tagId, tags.id))
      .where(ilike(tags.name, pattern));

    const searchCondition = or(
      ilike(timeEntries.description, pattern),
      ilike(projects.name, pattern),
      ilike(users.name, pattern),
      ilike(users.email, pattern),
      ilike(applicants.name, pattern),
      ilike(applicants.email, pattern),
      inArray(timeEntries.id, entryIdsMatchingTag),
    );
    if (searchCondition) conditions.push(searchCondition);
  }

  const rawLimit = params.limit ?? "50";
  const limitValue = rawLimit === "all" ? null : (parseInt(rawLimit) || 50);

  const baseQuery = db
    .select({
      entry: timeEntries,
      project: projects,
      user: { id: users.id, name: users.name, email: users.email },
    })
    .from(timeEntries)
    .leftJoin(projects, eq(timeEntries.projectId, projects.id))
    .leftJoin(users, eq(timeEntries.userId, users.id))
    .leftJoin(applicants, eq(timeEntries.applicantId, applicants.id))
    .where(and(...conditions))
    .orderBy(desc(timeEntries.startedAt));

  const rows = limitValue !== null ? await baseQuery.limit(limitValue) : await baseQuery;

  if (rows.length === 0) return [];

  // Fetch tags for all returned entries
  const entryIds = rows.map((r) => r.entry.id);
  const [tagRows, ownerDisplayMap] = await Promise.all([
    db
      .select({ timeEntryId: timeEntryTags.timeEntryId, tagId: tags.id, tagName: tags.name })
      .from(timeEntryTags)
      .innerJoin(tags, eq(timeEntryTags.tagId, tags.id))
      .where(inArray(timeEntryTags.timeEntryId, entryIds)),
    chronosEntryOwnerDisplayMap(rows.map((r) => ({ userId: r.entry.userId, applicantId: r.entry.applicantId ?? null }))),
  ]);

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
    user: ownerDisplayMap.get(`${entry.userId}:${entry.applicantId ?? ""}`) ?? user ?? undefined,
  })) as TimeEntry[];
}

function groupEntries(entries: TimeEntry[], groupBy: string): ReportRow[] {
  const map = new Map<string, { totalMs: number; count: number; sortDate?: string }>();

  for (const entry of entries) {
    let key = "";
    let sortDate: string | undefined;

    switch (groupBy) {
      case "project":
        key = entry.project?.name ?? entry.projectId ?? "No project";
        break;
      case "user":
        key = entry.user?.name ?? "Unknown User";
        break;
      case "week": {
        const d = new Date(entry.startedAt);
        const weekStart = new Date(d);
        weekStart.setHours(0, 0, 0, 0);
        weekStart.setDate(d.getDate() - d.getDay());
        sortDate = weekStart.toISOString();
        key = `Week ${Math.floor(d.getDate() / 7) + 1}, ${d.toLocaleDateString("en-US", { month: "short", year: "numeric" })}`;
        break;
      }
      case "month": {
        const d = new Date(entry.startedAt);
        const monthStart = new Date(d.getFullYear(), d.getMonth(), 1);
        sortDate = monthStart.toISOString();
        key = d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
        break;
      }
      default: {
        const d = new Date(entry.startedAt);
        sortDate = new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
        key = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
        break;
      }
    }

    const existing = map.get(key) ?? { totalMs: 0, count: 0, sortDate };
    map.set(key, {
      totalMs: existing.totalMs + (entry.durationMs ?? 0),
      count: existing.count + 1,
      sortDate: existing.sortDate ?? sortDate,
    });
  }

  return Array.from(map.entries()).map(([label, { totalMs, count, sortDate }]) => ({
    label,
    totalMs,
    entryCount: count,
    sortDate,
  }));
}

function buildChartData(entries: TimeEntry[]) {
  const today = new Date();
  const days: { label: string; date: string; hours: number }[] = [];
  const DAY_ABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dateStr = d.toISOString().split("T")[0];
    const ms = entries
      .filter((e) => new Date(e.startedAt).toISOString().split("T")[0] === dateStr)
      .reduce((sum, e) => sum + (e.durationMs ?? 0), 0);
    days.push({ label: DAY_ABBR[d.getDay()], date: dateStr, hours: Math.round((ms / 3_600_000) * 10) / 10 });
  }
  return days;
}

interface ReportsPageProps {
  searchParams: Promise<SearchParams>;
}

export default async function ReportsPage({ searchParams }: ReportsPageProps) {
  const session = await auth();
  const sessionUser = session?.user;
  const params = await searchParams;

  const ownerChronosUserId =
    (await resolveChronosUserIdForSessionUser(sessionUser!)) ??
    requireChronosUserIdFromSessionUser(sessionUser!);
  const linkedApplicantId = applicantIdForSessionLinkedUser(sessionUser!);

  const [filterData, entries] = await Promise.all([
    getFilterData(sessionUser!, ownerChronosUserId, linkedApplicantId),
    getEntries(params, sessionUser!, ownerChronosUserId, linkedApplicantId),
  ]);

  const groupBy = params.groupBy ?? "day";
  const reportRows = groupEntries(entries, groupBy);
  const chartData = buildChartData(entries);
  const totalMs = entries.reduce((s, e) => s + (e.durationMs ?? 0), 0);
  const totalHours = (totalMs / 3_600_000).toFixed(1);

  return (
    <div className="flex flex-col gap-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1
            className="text-2xl font-light italic text-on-background"
            style={{ fontFamily: "var(--font-newsreader, 'Newsreader'), serif" }}
          >
            Reports
          </h1>
          <p
            className="text-sm text-on-surface-variant mt-0.5"
            style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
          >
            {entries.length} entries &mdash; {totalHours}h total
          </p>
        </div>
        <ExportCSVButton entries={entries} />
      </div>

      {/* Filters */}
      <Suspense>
        <ReportFilters
          projects={filterData.projects}
          tags={filterData.tags}
          users={filterData.users}
        />
      </Suspense>

      {/* Chart */}
      <ReportChart data={chartData} title="Daily Hours — Past 7 Days" />

      {/* Summary stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[
          { label: "Total Hours", value: `${totalHours}h`, icon: "schedule" },
          { label: "Sessions", value: String(entries.length), icon: "timer" },
          {
            label: "Avg / Day",
            value: chartData.filter((d) => d.hours > 0).length > 0
              ? `${(parseFloat(totalHours) / chartData.filter((d) => d.hours > 0).length).toFixed(1)}h`
              : "—",
            icon: "bar_chart",
          },
        ].map(({ label, value, icon }) => (
          <div key={label} className="bg-surface-container-lowest rounded-xl paper-shadow p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-primary-container flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-primary" style={{ fontSize: "20px" }}>{icon}</span>
            </div>
            <div>
              <p
                className="text-xs text-on-surface-variant uppercase tracking-wide font-medium"
                style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
              >
                {label}
              </p>
              <p
                className="text-2xl font-light italic text-on-background tabular-nums"
                style={{ fontFamily: "var(--font-newsreader, 'Newsreader'), serif" }}
              >
                {value}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Table */}
      <ReportTable rows={reportRows} title={`Breakdown by ${groupBy}`} />

      {/* Detailed entries */}
      <ReportEntries entries={entries} viewerRole={sessionUser!.role} viewerId={sessionUser!.id} />
    </div>
  );
}
