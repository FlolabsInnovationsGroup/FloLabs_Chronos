/**
 * Migration: add Notion-sync columns to teams table.
 * Adds: is_active, notion_page_id, general_webhook_url, meetings_webhook_url
 */

import { readFileSync } from "fs";
import { resolve } from "path";

try {
  const envPath = resolve(process.cwd(), ".env.local");
  const content = readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim().replace(/^"|"$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
} catch { /* .env.local not found */ }

import { neon } from "@neondatabase/serverless";

async function main() {
  const url =
    process.env.DATABASE_URL ??
    process.env.FL_CHRONOS_DATABASE_URL ??
    process.env.FL_CHRONOS_DATABASE_URL_UNPOOLED;
  if (!url) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }

  const sql = neon(url);
  console.log("Running teams-notion migration...");

  await sql`
    ALTER TABLE teams
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS notion_page_id TEXT,
    ADD COLUMN IF NOT EXISTS general_webhook_url TEXT,
    ADD COLUMN IF NOT EXISTS meetings_webhook_url TEXT
  `;

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS teams_notion_page_id_unique
    ON teams(notion_page_id)
    WHERE notion_page_id IS NOT NULL
  `;

  console.log("Migration complete: teams table updated with Notion-sync columns.");
}

main().catch((err) => { console.error("Migration failed:", err); process.exit(1); });
