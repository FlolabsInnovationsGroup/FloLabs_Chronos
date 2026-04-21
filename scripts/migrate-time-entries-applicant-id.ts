/**
 * Phase 3: add nullable time_entries.applicant_id (FK → applicants), index, and backfill from
 * time_entries.user_id = applicants.chronos_user_id. Logs rows with no matching applicant.
 */

import { createPool, createSqlHelpers, loadEnvFiles } from "./db-utils";

loadEnvFiles([".env.local"]);

async function main() {
  const pool = createPool();
  const sql = createSqlHelpers(pool);

  try {
    console.log("Running time_entries.applicant_id migration + backfill...");

    await sql.exec(`
      ALTER TABLE time_entries
      ADD COLUMN IF NOT EXISTS applicant_id UUID REFERENCES applicants(id) ON DELETE SET NULL
    `);

    await sql.exec(`
      CREATE INDEX IF NOT EXISTS idx_entries_applicant ON time_entries(applicant_id)
    `);

    await sql.exec(`
      UPDATE time_entries te
      SET applicant_id = a.id
      FROM applicants a
      WHERE te.user_id = a.chronos_user_id
        AND a.chronos_user_id IS NOT NULL
        AND te.applicant_id IS NULL
    `);
    console.log("Backfill UPDATE completed.");

    const stillOrphans = await sql.query<{ id: string; user_id: string }>(`
      SELECT te.id, te.user_id
      FROM time_entries te
      WHERE te.applicant_id IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM applicants a WHERE a.chronos_user_id = te.user_id
        )
    `);

    if (stillOrphans.length > 0) {
      console.warn(
        `time_entries rows with no applicant match (applicants.chronos_user_id): ${stillOrphans.length}`
      );
      for (const o of stillOrphans.slice(0, 50)) {
        console.warn(`  entry ${o.id} user_id=${o.user_id}`);
      }
      if (stillOrphans.length > 50) {
        console.warn(`  ... and ${stillOrphans.length - 50} more`);
      }
    } else {
      console.log("No orphan time_entries without a joinable applicant.");
    }

    console.log("Migration complete: time_entries.applicant_id added and backfilled.");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
