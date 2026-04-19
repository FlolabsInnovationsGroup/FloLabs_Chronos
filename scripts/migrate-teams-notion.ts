/**
 * Migration: add Notion-sync columns to teams table.
 * Adds: is_active, notion_page_id, general_webhook_url, meetings_webhook_url
 */

import { createPool, createSqlHelpers, loadEnvFiles } from "./db-utils";

loadEnvFiles([".env.local"]);

async function main() {
  const pool = createPool();
  const sql = createSqlHelpers(pool);

  try {
    console.log("Running teams-notion migration...");

    await sql.exec(`
      ALTER TABLE teams
      ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS notion_page_id TEXT,
      ADD COLUMN IF NOT EXISTS general_webhook_url TEXT,
      ADD COLUMN IF NOT EXISTS meetings_webhook_url TEXT
    `);

    await sql.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS teams_notion_page_id_unique
      ON teams(notion_page_id)
      WHERE notion_page_id IS NOT NULL
    `);

    console.log("Migration complete: teams table updated with Notion-sync columns.");
  } finally {
    await pool.end();
  }
}

main().catch((err) => { console.error("Migration failed:", err); process.exit(1); });
