import { db } from "@/lib/db";
import { timeEntries } from "@/lib/db/schema";
import { sql, and, or, gte, lte, isNotNull } from "drizzle-orm";

export async function getReportMetrics(startDate: string, endDate: string) {
  const start = new Date(startDate);
  const end = new Date(endDate);

  const results = await db
    .select({
      totalSessions: sql<number>`COUNT(*)::int`,
      totalDurationSeconds: sql<number>`COALESCE(SUM(EXTRACT(EPOCH FROM (stopped_at - started_at))), 0)`,
      averageDurationSeconds: sql<number>`COALESCE(AVG(EXTRACT(EPOCH FROM (stopped_at - started_at))), 0)`,
    })
    .from(timeEntries)
    .where(
      and(
        isNotNull(timeEntries.stoppedAt),
        or(
          and(gte(timeEntries.stoppedAt, start), lte(timeEntries.stoppedAt, end)),
          and(gte(timeEntries.startedAt, start), lte(timeEntries.startedAt, end)),
        ),
      ),
    );

  if (!results || results.length === 0) {
    return { totalSessions: 0, totalHours: 0, averageHours: 0 };
  }

  const row = results[0];
  const totalSessions = Number(row.totalSessions);
  const totalSeconds = Number(row.totalDurationSeconds);
  const averageSeconds = Number(row.averageDurationSeconds);

  return {
    totalSessions,
    totalHours: Math.floor(totalSeconds / 3600),
    averageHours: totalSessions > 0 ? Math.floor(averageSeconds / 3600) : 0,
  };
}
