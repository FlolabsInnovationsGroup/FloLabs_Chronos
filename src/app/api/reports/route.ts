import { NextResponse } from "next/server";
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
  inArray,
  or,
  ilike,
  type SQL,
} from "drizzle-orm";
import { getAccessibleUserIds } from "@/lib/permissions";
import { applicantIdForSessionLinkedUser, chronosUserIdFromSessionUser } from "@/lib/chronos-session";
import { whereTimeEntriesForLinkedUser } from "@/lib/time-entry-applicant";
import { chronosEntryOwnerDisplayMap } from "@/lib/chronos-user-notion";

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
  const ownerChronosUserId = chronosUserIdFromSessionUser(session.user);
  const linkedApplicantId = applicantIdForSessionLinkedUser(session.user);

  if (accessibleUserIds !== null) {
    if (userId && !accessibleUserIds.includes(userId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (userId) {
      conditions.push(
        ownerChronosUserId && userId === ownerChronosUserId
          ? whereTimeEntriesForLinkedUser(ownerChronosUserId, linkedApplicantId)
          : eq(timeEntries.userId, userId)
      );
    } else if (ownerChronosUserId && accessibleUserIds.length === 1 && accessibleUserIds[0] === ownerChronosUserId) {
      conditions.push(whereTimeEntriesForLinkedUser(ownerChronosUserId, linkedApplicantId));
    } else if (accessibleUserIds.length === 1) {
      conditions.push(eq(timeEntries.userId, accessibleUserIds[0]));
    } else {
      conditions.push(inArray(timeEntries.userId, accessibleUserIds));
    }
  } else if (userId) {
    conditions.push(
      ownerChronosUserId && userId === ownerChronosUserId
        ? whereTimeEntriesForLinkedUser(ownerChronosUserId, linkedApplicantId)
        : eq(timeEntries.userId, userId)
    );
  }

  if (projectId) conditions.push(eq(timeEntries.projectId, projectId));
  if (from) conditions.push(gte(timeEntries.startedAt, new Date(from)));
  if (to) conditions.push(lte(timeEntries.startedAt, new Date(to)));

  // Tag filter: entries that have this tag via join table
  if (tagId) {
    const entryIdsWithTag = db
      .select({ id: timeEntryTags.timeEntryId })
      .from(timeEntryTags)
      .where(eq(timeEntryTags.tagId, tagId));
    conditions.push(inArray(timeEntries.id, entryIdsWithTag));
  }

  // Search filter: match description, project name, applicant/user name/email, or tag name
  if (search) {
    const pattern = `%${search}%`;
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

  const rows = await db
    .select({
      entry: timeEntries,
      project: { id: projects.id, name: projects.name, color: projects.color },
      user: { id: users.id, name: users.name, email: users.email },
    })
    .from(timeEntries)
    .leftJoin(projects, eq(timeEntries.projectId, projects.id))
    .leftJoin(users, eq(timeEntries.userId, users.id))
    .leftJoin(applicants, eq(timeEntries.applicantId, applicants.id))
    .where(and(...conditions))
    .orderBy(desc(timeEntries.startedAt));

  // Fetch tags for all entries
  const entryIds = rows.map((r) => r.entry.id);
  const [tagRows, ownerDisplayMap] = await Promise.all([
    entryIds.length > 0
      ? db
          .select({
            timeEntryId: timeEntryTags.timeEntryId,
            tagId: tags.id,
            tagName: tags.name,
          })
          .from(timeEntryTags)
          .innerJoin(tags, eq(timeEntryTags.tagId, tags.id))
          .where(inArray(timeEntryTags.timeEntryId, entryIds))
      : Promise.resolve([]),
    chronosEntryOwnerDisplayMap(rows.map((r) => ({ userId: r.entry.userId, applicantId: r.entry.applicantId ?? null }))),
  ]);

  const tagMap = new Map<string, { id: string; name: string }[]>();
  for (const r of tagRows) {
    const existing = tagMap.get(r.timeEntryId) ?? [];
    existing.push({ id: r.tagId, name: r.tagName });
    tagMap.set(r.timeEntryId, existing);
  }

  // CSV export
  if (format === "csv") {
    const csvLines = [
      "Date,User,Project,Tags,Description,Duration (h),Started,Stopped",
      ...rows.map(({ entry, project, user }) => {
        const durationH = ((entry.durationMs ?? 0) / 3600000).toFixed(2);
        const entryTags = (tagMap.get(entry.id) ?? []).map((t) => t.name).join("; ");
        const owner = ownerDisplayMap.get(`${entry.userId}:${entry.applicantId ?? ""}`) ?? user;
        return [
          new Date(entry.startedAt).toISOString().split("T")[0],
          owner?.name ?? "",
          project?.name ?? "",
          `"${entryTags.replace(/"/g, '""')}"`,
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
    const owner = ownerDisplayMap.get(`${entry.userId}:${entry.applicantId ?? ""}`) ?? user;
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
      label = owner?.name ?? entry.userId;
    } else if (groupBy === "project") {
      key = entry.projectId ?? "no-project";
      label = project?.name ?? entry.projectId ?? "No project";
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
