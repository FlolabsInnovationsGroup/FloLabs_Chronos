/**
 * Migration: add edited_field column to time_entries.
 * Tracks which extreme was edited (start or end) so the other can be locked.
 */

import { createPool, createSqlHelpers, loadEnvFiles } from "./db-utils";

loadEnvFiles([".env.local"]);

async function main() {
  const pool = createPool();
  const sql = createSqlHelpers(pool);

  try {
    console.log("Running edited_field migration...");

    await sql.exec(`
      ALTER TABLE time_entries
      ADD COLUMN IF NOT EXISTS edited_field TEXT DEFAULT NULL
      CHECK (edited_field IN ('start', 'end'))
    `);

    console.log("Migration complete: edited_field column added to time_entries.");
  } finally {
    await pool.end();
  }
}

main().catch((err) => { console.error("Migration failed:", err); process.exit(1); });
