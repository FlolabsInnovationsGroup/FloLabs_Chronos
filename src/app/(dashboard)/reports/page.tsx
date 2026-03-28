import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { timeEntries, projects, tags, users } from "@/lib/db/schema";
import { eq, and, gte, lte, isNotNull, desc, like, inArray, type SQL } from "drizzle-orm";
import { ReportFilters } from "@/components/reports/ReportFilters";
import { ReportChart } from "@/components/reports/ReportChart";
import { ReportTable } from "@/components/reports/ReportTable";
import { ExportCSVButton } from "@/components/reports/ExportCSVButton";
import { Suspense } from "react";
import type { Project, Tag, ReportRow, TimeEntry } from "@/types";
import { getAccessibleUserIds, getAccessibleUsers, isAdmin as userIsAdmin } from "@/lib/permissions";

export const metadata: Metadata = { title: "Reports | FloLabs Chronos" };

interface SearchParams {
  from?: string;
  to?: string;
  userId?: string;
  projectId?: string;
  tagId?: string;
  search?: string;
  groupBy?: string;
}

async function getFilterData(sessionUser: {
  id: string;
  role: "admin" | "team_lead" | "member";
  teamId: string | null;
  isActive: boolean;
}) {
  if (!db) return { projects: [], tags: [], users: [] };
  const [projectRows, tagRows, userRows] = await Promise.all([
    db.select().from(projects).where(eq(projects.archived, false)).orderBy(projects.name),
    db.select().from(tags).orderBy(tags.name),
    getAccessibleUsers(sessionUser),
  ]);
  return {
    projects: projectRows as Project[],
    tags: tagRows as Tag[],
    users: (userIsAdmin(sessionUser) || sessionUser.role === "team_lead"
      ? userRows
      : []) as import("@/types").User[],
  };
}

async function getEntries(
  params: SearchParams,
  sessionUser: {
    id: string;
    role: "admin" | "team_lead" | "member";
    teamId: string | null;
    isActive: boolean;
  }
) {
  if (!db) return [];

  const conditions: SQL[] = [isNotNull(timeEntries.stoppedAt)];
  const accessibleUserIds = await getAccessibleUserIds(sessionUser);

  if (accessibleUserIds !== null) {
    if (params.userId && !accessibleUserIds.includes(params.userId)) {
      return [];
    }

    if (params.userId) {
      conditions.push(eq(timeEntries.userId, params.userId));
    } else if (accessibleUserIds.length === 1) {
      conditions.push(eq(timeEntries.userId, accessibleUserIds[0]));
    } else {
      conditions.push(inArray(timeEntries.userId, accessibleUserIds));
    }
  } else if (params.userId) {
    conditions.push(eq(timeEntries.userId, params.userId));
  }

  if (params.from) conditions.push(gte(timeEntries.startedAt, new Date(params.from)));
  if (params.to) {
    const toDate = new Date(params.to);
    toDate.setHours(23, 59, 59, 999);
    conditions.push(lte(timeEntries.startedAt, toDate));
  }
  if (params.projectId) conditions.push(eq(timeEntries.projectId, params.projectId));
  if (params.tagId) conditions.push(eq(timeEntries.tagId, params.tagId));
  if (params.search) conditions.push(like(timeEntries.description, `%${params.search}%`));

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
    .where(and(...conditions))
    .orderBy(desc(timeEntries.startedAt))
    .limit(500);

  return rows.map(({ entry, project, tag, user }) => ({
    ...entry,
    project: project ?? undefined,
    tag: tag ?? null,
    user: user ?? undefined,
  })) as TimeEntry[];
}

function groupEntries(entries: TimeEntry[], groupBy: string): ReportRow[] {
  const map = new Map<string, { totalMs: number; count: number }>();

  for (const entry of entries) {
    let key = "";
    switch (groupBy) {
      case "project":
        key = entry.project?.name ?? "Unknown Project";
        break;
      case "user":
        key = entry.user?.name ?? "Unknown User";
        break;
      case "week": {
        const d = new Date(entry.startedAt);
        const week = Math.floor(d.getDate() / 7);
        key = `Week ${week + 1}, ${d.toLocaleDateString("en-US", { month: "short", year: "numeric" })}`;
        break;
      }
      case "month": {
        const d = new Date(entry.startedAt);
        key = d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
        break;
      }
      default: {
        // by day
        const d = new Date(entry.startedAt);
        key = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
        break;
      }
    }
    const existing = map.get(key) ?? { totalMs: 0, count: 0 };
    map.set(key, {
      totalMs: existing.totalMs + (entry.durationMs ?? 0),
      count: existing.count + 1,
    });
  }

  return Array.from(map.entries())
    .map(([label, { totalMs, count }]) => ({
      label,
      totalMs,
      entryCount: count,
    }))
    .sort((a, b) => b.totalMs - a.totalMs);
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
    days.push({
      label: DAY_ABBR[d.getDay()],
      date: dateStr,
      hours: Math.round((ms / 3_600_000) * 10) / 10,
    });
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

  const [filterData, entries] = await Promise.all([
    getFilterData(sessionUser!),
    getEntries(params, sessionUser!),
  ]);

  const groupBy = params.groupBy ?? "day";
  const reportRows = groupEntries(entries, groupBy);
  const chartData = buildChartData(entries);
  const totalMs = entries.reduce((s, e) => s + (e.durationMs ?? 0), 0);
  const totalHours = (totalMs / 3_600_000).toFixed(1);

  return (
    <div className="flex flex-col gap-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1
            className="text-2xl font-light italic text-[#31332f]"
            style={{ fontFamily: "var(--font-newsreader, 'Newsreader'), serif" }}
          >
            Reports
          </h1>
          <p
            className="text-sm text-[#5e605b] mt-0.5"
            style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
          >
            {entries.length} entries &mdash; {totalHours}h total
          </p>
        </div>

        {/* CSV export */}
        <ExportCSVButton entries={entries} />
      </div>

      {/* Filters (client component needs Suspense) */}
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
      <div className="grid grid-cols-3 gap-4">
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
            <div className="w-10 h-10 rounded-xl bg-[#b9ecee] flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[#366769]" style={{ fontSize: "20px" }}>{icon}</span>
            </div>
            <div>
              <p
                className="text-xs text-[#5e605b] uppercase tracking-wide font-medium"
                style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
              >
                {label}
              </p>
              <p
                className="text-2xl font-light italic text-[#31332f] tabular-nums"
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
    </div>
  );
}
