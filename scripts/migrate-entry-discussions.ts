/**
 * Migration script for the entry_discussions table.
 * Creates the table and indexes for the entry discussions feature.
 */

import { createPool, createSqlHelpers, loadEnvFiles } from "./db-utils";

loadEnvFiles([".env.local"]);

async function main() {
  const pool = createPool();
  const sql = createSqlHelpers(pool);

  try {
    console.log("Running entry_discussions migration...");

    console.log("1. Creating entry_discussions table...");
    await sql.exec(`
      CREATE TABLE IF NOT EXISTS entry_discussions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        entry_id UUID NOT NULL REFERENCES time_entries(id) ON DELETE CASCADE,
        started_by_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        message TEXT NOT NULL,
        resolved_at TIMESTAMPTZ,
        resolved_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      )
    `);

    console.log("2. Creating indexes...");
    try { await sql.exec("CREATE INDEX IF NOT EXISTS idx_discussions_entry ON entry_discussions(entry_id)"); } catch {}
    try { await sql.exec("CREATE INDEX IF NOT EXISTS idx_discussions_started_by ON entry_discussions(started_by_id)"); } catch {}
    try { await sql.exec("CREATE INDEX IF NOT EXISTS idx_discussions_unresolved ON entry_discussions(entry_id, resolved_at)"); } catch {}

    console.log("entry_discussions migration complete!");
  } finally {
    await pool.end();
  }
}

main().catch((err) => { console.error("Migration failed:", err); process.exit(1); });
