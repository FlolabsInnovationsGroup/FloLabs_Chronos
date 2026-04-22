/**
 * Phase 3: add nullable tags.applicant_id (FK → applicants), index, and backfill from
 * tags.user_id = applicants.chronos_user_id. Logs tags with no matching applicant.
 */

import { createPool, createSqlHelpers, loadEnvFiles } from "./db-utils";

loadEnvFiles([".env.local"]);

async function main() {
  const pool = createPool();
  const sql = createSqlHelpers(pool);

  try {
    console.log("Running tags.applicant_id migration + backfill...");

    await sql.exec(`
      ALTER TABLE tags
      ADD COLUMN IF NOT EXISTS applicant_id UUID REFERENCES applicants(id) ON DELETE SET NULL
    `);

    await sql.exec(`
      CREATE INDEX IF NOT EXISTS idx_tags_applicant ON tags(applicant_id)
    `);

    await sql.exec(`
      UPDATE tags t
      SET applicant_id = a.id
      FROM applicants a
      WHERE t.user_id = a.chronos_user_id
        AND a.chronos_user_id IS NOT NULL
        AND t.applicant_id IS NULL
    `);
    console.log("Backfill UPDATE completed.");

    const stillOrphans = await sql.query<{ id: string; user_id: string }>(`
      SELECT t.id, t.user_id
      FROM tags t
      WHERE t.applicant_id IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM applicants a WHERE a.chronos_user_id = t.user_id
        )
    `);

    if (stillOrphans.length > 0) {
      console.warn(
        `tags rows with no applicant match (applicants.chronos_user_id): ${stillOrphans.length}`
      );
      for (const o of stillOrphans.slice(0, 50)) {
        console.warn(`  tag ${o.id} user_id=${o.user_id}`);
      }
      if (stillOrphans.length > 50) {
        console.warn(`  ... and ${stillOrphans.length - 50} more`);
      }
    } else {
      console.log("No orphan tags without a joinable applicant.");
    }

    console.log("Migration complete: tags.applicant_id added and backfilled.");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
