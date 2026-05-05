
/**
 * Retrieves aggregated report metrics for a given time range.
 * @param startDate The start date for the report (ISO string).
 * @param endDate The end date for the report (ISO string).
 * @returns An object containing total sessions, total hours, and average session length.
 */
export async function getReportMetrics(startDate: string, endDate: string) {
  // Calculate the duration difference in seconds for the aggregation.
  // Assuming the duration calculation (End - Start) is done in seconds for aggregation.
  // Note: The exact Drizzle/DB functions needed for date arithmetic (e.g., SQLite, PostgreSQL)
  // must be adapted here. This is a general structure.
  const results = await db
    .select({
      totalSessions: sql`COUNT(id)`,
      totalDurationSeconds: sql<number>`SUM(julianday(stoppedAt) - julianday(startedAt)) * 86400`, // Example for SQLite
      // For PostgreSQL: totalDurationSeconds: sql`SUM(EXTRACT(EPOCH FROM (stoppedAt - startedAt))`:
      averageDurationSeconds: sql`AVG(julianday(stoppedAt) - julianday(startedAt)) * 86400`,
    })
    .from(TimeEntry)
    .where(and(
      // Filter by the date range, handling null 'stoppedAt' fields
      or(
        and(
          sql`stoppedAt IS NOT NULL`,
          sql`julianday(stoppedAt) BETWEEN julianday(${startDate}) AND julianday(${endDate})`
        ),
        // Optionally: include started sessions if they fall in the date range
        and(
          sql`startedAt IS NOT NULL`,
          sql`julianday(startedAt) BETWEEN julianday(${startDate}) AND julianday(${endDate})`
        )
      )
    ));

  if (!results || results.length === 0) {
    return { totalSessions: 0, totalHours: 0, averageHours: 0 };
  }

  const row = results[0];
  const totalSessions = Number(row.totalSessions);
  const totalSeconds = Number(row.totalDurationSeconds);
  const averageSeconds = Number(row.averageDurationSeconds);

  const totalHours = Math.floor(totalSeconds / 3600);
  const averageHours = totalSessions > 0 ? Math.floor(averageSeconds / 3600) : 0;

  return {
    totalSessions: totalSessions,
    totalHours: totalHours,
    averageHours: averageHours,
  };
}
