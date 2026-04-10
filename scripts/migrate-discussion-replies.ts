/**
 * Migration script for the discussion_replies table.
 * Creates the table and indexes for the discussion replies feature.
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
  console.log("Running discussion_replies migration...");

  console.log("1. Creating discussion_replies table...");
  await sql`
    CREATE TABLE IF NOT EXISTS discussion_replies (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      discussion_id UUID NOT NULL REFERENCES entry_discussions(id) ON DELETE CASCADE,
      author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      message TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    )
  `;

  console.log("2. Creating indexes...");
  try { await sql`CREATE INDEX IF NOT EXISTS idx_replies_discussion ON discussion_replies(discussion_id)`; } catch { /* */ }
  try { await sql`CREATE INDEX IF NOT EXISTS idx_replies_author ON discussion_replies(author_id)`; } catch { /* */ }

  console.log("discussion_replies migration complete!");
}

main().catch((err) => { console.error("Migration failed:", err); process.exit(1); });
