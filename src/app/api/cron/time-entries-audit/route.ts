import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!db) return NextResponse.json({ error: "DB not available" }, { status: 503 });

  try {
    // Phase 3 safety: ensure canonical applicant FK exists before auditing reads.
    await db.execute(
      sql`ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS applicant_id UUID REFERENCES applicants(id) ON DELETE SET NULL`
    );
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_entries_applicant ON time_entries(applicant_id)`);

    const backfill = await db.execute(sql`
      UPDATE time_entries te
      SET applicant_id = a.id
      FROM applicants a
      WHERE te.user_id = a.chronos_user_id
        AND a.chronos_user_id IS NOT NULL
        AND te.applicant_id IS NULL
    `);

    const counts = await db.execute(sql`
      WITH t AS (
        SELECT
          te.id,
          te.user_id,
          te.applicant_id,
          u.id AS user_exists,
          a.id AS applicant_exists,
          a.chronos_user_id AS applicant_chronos_user_id
        FROM time_entries te
        LEFT JOIN users u ON u.id = te.user_id
        LEFT JOIN applicants a ON a.id = te.applicant_id
      )
      SELECT
        count(*)::int AS total_entries,
        count(*) FILTER (WHERE user_id IS NOT NULL)::int AS entries_with_user_id,
        count(*) FILTER (WHERE user_exists IS NOT NULL)::int AS entries_with_existing_user_fk,
        count(*) FILTER (WHERE applicant_id IS NOT NULL)::int AS entries_with_applicant_id,
        count(*) FILTER (WHERE applicant_exists IS NOT NULL)::int AS entries_with_existing_applicant_fk,
        count(*) FILTER (
          WHERE applicant_id IS NOT NULL
            AND applicant_exists IS NOT NULL
            AND applicant_chronos_user_id = user_id
        )::int AS entries_where_applicant_links_same_user,
        count(*) FILTER (WHERE applicant_id IS NOT NULL AND applicant_exists IS NULL)::int AS orphan_applicant_fk,
        count(*) FILTER (WHERE user_id IS NOT NULL AND user_exists IS NULL)::int AS orphan_user_fk,
        count(*) FILTER (
          WHERE applicant_id IS NOT NULL
            AND applicant_exists IS NOT NULL
            AND applicant_chronos_user_id IS NOT NULL
            AND applicant_chronos_user_id <> user_id
        )::int AS applicant_user_mismatch
      FROM t
    `);

    const summary = (counts as unknown as { rows?: Array<Record<string, unknown>> }).rows?.[0] ?? null;

    return NextResponse.json({
      ok: true,
      backfillRowCount:
        (backfill as unknown as { rowCount?: number }).rowCount ??
        (backfill as unknown as { rowsAffected?: number }).rowsAffected ??
        null,
      summary,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
