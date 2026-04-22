/**
 * Phase 3: nullable applicant FKs on entry_discussions (starter + resolver) and
 * discussion_replies (author), indexed and backfilled from applicants.chronos_user_id.
 */

import { createPool, createSqlHelpers, loadEnvFiles } from "./db-utils";

loadEnvFiles([".env.local"]);

async function main() {
  const pool = createPool();
  const sql = createSqlHelpers(pool);

  try {
    console.log("Running entry_discussions / discussion_replies applicant id migration + backfill...");

    await sql.exec(`
      ALTER TABLE entry_discussions
      ADD COLUMN IF NOT EXISTS started_by_applicant_id UUID REFERENCES applicants(id) ON DELETE SET NULL
    `);
    await sql.exec(`
      ALTER TABLE entry_discussions
      ADD COLUMN IF NOT EXISTS resolved_by_applicant_id UUID REFERENCES applicants(id) ON DELETE SET NULL
    `);
    await sql.exec(`
      CREATE INDEX IF NOT EXISTS idx_discussions_started_by_applicant ON entry_discussions(started_by_applicant_id)
    `);
    await sql.exec(`
      CREATE INDEX IF NOT EXISTS idx_discussions_resolved_by_applicant ON entry_discussions(resolved_by_applicant_id)
    `);

    await sql.exec(`
      ALTER TABLE discussion_replies
      ADD COLUMN IF NOT EXISTS author_applicant_id UUID REFERENCES applicants(id) ON DELETE SET NULL
    `);
    await sql.exec(`
      CREATE INDEX IF NOT EXISTS idx_replies_author_applicant ON discussion_replies(author_applicant_id)
    `);

    await sql.exec(`
      UPDATE entry_discussions d
      SET started_by_applicant_id = a.id
      FROM applicants a
      WHERE d.started_by_id = a.chronos_user_id
        AND a.chronos_user_id IS NOT NULL
        AND d.started_by_applicant_id IS NULL
    `);
    await sql.exec(`
      UPDATE entry_discussions d
      SET resolved_by_applicant_id = a.id
      FROM applicants a
      WHERE d.resolved_by_id = a.chronos_user_id
        AND a.chronos_user_id IS NOT NULL
        AND d.resolved_by_applicant_id IS NULL
    `);
    await sql.exec(`
      UPDATE discussion_replies r
      SET author_applicant_id = a.id
      FROM applicants a
      WHERE r.author_id = a.chronos_user_id
        AND a.chronos_user_id IS NOT NULL
        AND r.author_applicant_id IS NULL
    `);

    console.log("Backfill UPDATE completed.");

    const orphanStarters = await sql.query<{ id: string }>(`
      SELECT id FROM entry_discussions
      WHERE started_by_applicant_id IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM applicants a WHERE a.chronos_user_id = entry_discussions.started_by_id
        )
    `);
    if (orphanStarters.length > 0) {
      console.warn(`entry_discussions rows with no applicant for starter (sample max 20): ${orphanStarters.length}`);
      for (const o of orphanStarters.slice(0, 20)) console.warn(`  discussion ${o.id}`);
    }

    console.log("Migration complete: discussion applicant columns added and backfilled.");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
