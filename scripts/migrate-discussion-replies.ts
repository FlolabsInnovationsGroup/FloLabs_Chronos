/**
 * Migration script for the discussion_replies table.
 * Creates the table and indexes for the discussion replies feature.
 */

import { createPool, createSqlHelpers, loadEnvFiles } from "./db-utils";

loadEnvFiles([".env.local"]);

async function main() {
  const pool = createPool();
  const sql = createSqlHelpers(pool);

  try {
    console.log("Running discussion_replies migration...");

    console.log("1. Creating discussion_replies table...");
    await sql.exec(`
      CREATE TABLE IF NOT EXISTS discussion_replies (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        discussion_id UUID NOT NULL REFERENCES entry_discussions(id) ON DELETE CASCADE,
        author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        message TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      )
    `);

    console.log("2. Creating indexes...");
    try { await sql.exec("CREATE INDEX IF NOT EXISTS idx_replies_discussion ON discussion_replies(discussion_id)"); } catch {}
    try { await sql.exec("CREATE INDEX IF NOT EXISTS idx_replies_author ON discussion_replies(author_id)"); } catch {}

    console.log("discussion_replies migration complete!");
  } finally {
    await pool.end();
  }
}

main().catch((err) => { console.error("Migration failed:", err); process.exit(1); });
