import { createPool, createSqlHelpers, loadEnvFiles } from "./db-utils";

loadEnvFiles([".env.local"]);

async function main() {
  const pool = createPool();
  const sql = createSqlHelpers(pool);

  try {
    console.log("Running flolabs_id migration...");

    await sql.exec(`ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS flolabs_id UUID REFERENCES applicants(id) ON DELETE SET NULL`);
    await sql.exec(`ALTER TABLE tags ADD COLUMN IF NOT EXISTS flolabs_id UUID REFERENCES applicants(id) ON DELETE SET NULL`);
    await sql.exec(`ALTER TABLE entry_discussions ADD COLUMN IF NOT EXISTS started_by_flolabs_id UUID REFERENCES applicants(id) ON DELETE SET NULL`);
    await sql.exec(`ALTER TABLE entry_discussions ADD COLUMN IF NOT EXISTS resolved_by_flolabs_id UUID REFERENCES applicants(id) ON DELETE SET NULL`);
    await sql.exec(`ALTER TABLE discussion_replies ADD COLUMN IF NOT EXISTS author_flolabs_id UUID REFERENCES applicants(id) ON DELETE SET NULL`);

    await sql.exec(`UPDATE time_entries SET flolabs_id = applicant_id WHERE flolabs_id IS NULL AND applicant_id IS NOT NULL`);
    await sql.exec(`UPDATE tags SET flolabs_id = applicant_id WHERE flolabs_id IS NULL AND applicant_id IS NOT NULL`);
    await sql.exec(`UPDATE entry_discussions SET started_by_flolabs_id = started_by_applicant_id WHERE started_by_flolabs_id IS NULL AND started_by_applicant_id IS NOT NULL`);
    await sql.exec(`UPDATE entry_discussions SET resolved_by_flolabs_id = resolved_by_applicant_id WHERE resolved_by_flolabs_id IS NULL AND resolved_by_applicant_id IS NOT NULL`);
    await sql.exec(`UPDATE discussion_replies SET author_flolabs_id = author_applicant_id WHERE author_flolabs_id IS NULL AND author_applicant_id IS NOT NULL`);

    await sql.exec(`
      UPDATE time_entries te
      SET flolabs_id = a.id
      FROM applicants a
      WHERE te.flolabs_id IS NULL
        AND te.user_id = a.chronos_user_id
    `);
    await sql.exec(`
      UPDATE tags t
      SET flolabs_id = a.id
      FROM applicants a
      WHERE t.flolabs_id IS NULL
        AND t.user_id = a.chronos_user_id
    `);
    await sql.exec(`
      UPDATE entry_discussions d
      SET started_by_flolabs_id = a.id
      FROM applicants a
      WHERE d.started_by_flolabs_id IS NULL
        AND d.started_by_id = a.chronos_user_id
    `);
    await sql.exec(`
      UPDATE entry_discussions d
      SET resolved_by_flolabs_id = a.id
      FROM applicants a
      WHERE d.resolved_by_flolabs_id IS NULL
        AND d.resolved_by_id = a.chronos_user_id
    `);
    await sql.exec(`
      UPDATE discussion_replies r
      SET author_flolabs_id = a.id
      FROM applicants a
      WHERE r.author_flolabs_id IS NULL
        AND r.author_id = a.chronos_user_id
    `);

    await sql.exec(`CREATE INDEX IF NOT EXISTS idx_entries_flolabs ON time_entries(flolabs_id)`);
    await sql.exec(`CREATE INDEX IF NOT EXISTS idx_tags_flolabs ON tags(flolabs_id)`);
    await sql.exec(`CREATE INDEX IF NOT EXISTS idx_discussions_started_by_flolabs ON entry_discussions(started_by_flolabs_id)`);
    await sql.exec(`CREATE INDEX IF NOT EXISTS idx_discussions_resolved_by_flolabs ON entry_discussions(resolved_by_flolabs_id)`);
    await sql.exec(`CREATE INDEX IF NOT EXISTS idx_replies_author_flolabs ON discussion_replies(author_flolabs_id)`);

    await sql.exec(`UPDATE applicants SET status = 'joined' WHERE lower(coalesce(status, '')) = 'active'`);
    await sql.exec(`UPDATE applicants SET stage = 'joined' WHERE lower(coalesce(stage, '')) = 'active'`);

    console.log("flolabs_id migration complete");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
