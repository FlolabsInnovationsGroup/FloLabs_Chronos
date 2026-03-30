import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { timeEntries, projects, tags, users } from "@/lib/db/schema";
import { eq, and, gte, lte, isNotNull, desc, inArray, or, ilike, type SQL } from "drizzle-orm";
import { getAccessibleUserIds } from "@/lib/permissions";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!db) return NextResponse.json({ rows: [], totalMs: 0, entryCount: 0 });

  const url = new URL(req.url);
  const userId = url.searchParams.get("userId");
  const projectId = url.searchParams.get("projectId");
  const tagId = url.searchParams.get("tagId");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const groupBy = url.searchParams.get("groupBy") ?? "day";
  const format = url.searchParams.get("format");
  const search = url.searchParams.get("search");

  const conditions: SQL[] = [isNotNull(timeEntries.stoppedAt)];
  const accessibleUserIds = await getAccessibleUserIds(session.user);

  if (accessibleUserIds !== null) {
    if (userId && !accessibleUserIds.includes(userId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (userId) {
      conditions.push(eq(timeEntries.userId, userId));
    } else if (accessibleUserIds.length === 1) {
      conditions.push(eq(timeEntries.userId, accessibleUserIds[0]));
    } else {
      conditions.push(inArray(timeEntries.userId, accessibleUserIds));
    }
  } else if (userId) {
    conditions.push(eq(timeEntries.userId, userId));
  }

  if (projectId) conditions.push(eq(timeEntries.projectId, projectId));
  if (tagId) conditions.push(eq(timeEntries.tagId, tagId));
  if (from) conditions.push(gte(timeEntries.startedAt, new Date(from)));
  if (to) conditions.push(lte(timeEntries.startedAt, new Date(to)));
  if (search) {
    const pattern = `%${search}%`;
    const searchCondition = or(
      ilike(timeEntries.description, pattern),
      ilike(projects.name, pattern),
      ilike(tags.name, pattern),
      ilike(users.name, pattern),
    );
    if (searchCondition) conditions.push(searchCondition);
  }

  const rows = await db
    .select({
      entry: timeEntries,
      project: { id: projects.id, name: projects.name, color: projects.color },
      tag: { id: tags.id, name: tags.name },
      user: { id: users.id, name: users.name, email: users.email },
    })
    .from(timeEntries)
    .leftJoin(projects, eq(timeEntries.projectId, projects.id))
    .leftJoin(tags, eq(timeEntries.tagId, tags.id))
    .leftJoin(users, eq(timeEntries.userId, users.id))
    .where(and(...conditions))
    .orderBy(desc(timeEntries.startedAt));

  // CSV export
  if (format === "csv") {
    const csvLines = [
      "Date,User,Project,Tag,Description,Duration (h),Started,Stopped",
      ...rows.map(({ entry, project, tag, user }) => {
        const durationH = ((entry.durationMs ?? 0) / 3600000).toFixed(2);
        return [
          new Date(entry.startedAt).toISOString().split("T")[0],
          user?.name ?? "",
          project?.name ?? "",
          tag?.name ?? "",
          `"${(entry.description ?? "").replace(/"/g, '""')}"`,
          durationH,
          new Date(entry.startedAt).toISOString(),
          entry.stoppedAt ? new Date(entry.stoppedAt).toISOString() : "",
        ].join(",");
      }),
    ].join("\n");

    return new Response(csvLines, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="flchron-report.csv"`,
      },
    });
  }

  // Grouping
  const groups: Record<string, { label: string; totalMs: number; entryCount: number }> = {};

  for (const { entry, project, user } of rows) {
    let key = "";
    let label = "";
    const date = new Date(entry.startedAt);

    if (groupBy === "day") {
      key = date.toISOString().split("T")[0];
      label = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    } else if (groupBy === "week") {
      const monday = new Date(date);
      monday.setDate(date.getDate() - ((date.getDay() + 6) % 7));
      key = monday.toISOString().split("T")[0];
      label = `Week of ${monday.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
    } else if (groupBy === "month") {
      key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      label = date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    } else if (groupBy === "user") {
      key = entry.userId;
      label = user?.name ?? entry.userId;
    } else if (groupBy === "project") {
      key = entry.projectId;
      label = project?.name ?? entry.projectId;
    }

    if (!groups[key]) groups[key] = { label, totalMs: 0, entryCount: 0 };
    groups[key].totalMs += entry.durationMs ?? 0;
    groups[key].entryCount += 1;
  }

  const totalMs = rows.reduce((sum, { entry }) => sum + (entry.durationMs ?? 0), 0);

  return NextResponse.json({
    rows: Object.entries(groups).map(([key, g]) => ({ key, ...g })),
    totalMs,
    entryCount: rows.length,
  });
}
