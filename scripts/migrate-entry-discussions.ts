/**
 * Migration script for the entry_discussions table.
 * Creates the table and indexes for the entry discussions feature.
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
  console.log("Running entry_discussions migration...");

  // Create the entry_discussions table
  console.log("1. Creating entry_discussions table...");
  await sql`
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
  `;

  // Create indexes
  console.log("2. Creating indexes...");
  try { await sql`CREATE INDEX IF NOT EXISTS idx_discussions_entry ON entry_discussions(entry_id)`; } catch { /* */ }
  try { await sql`CREATE INDEX IF NOT EXISTS idx_discussions_started_by ON entry_discussions(started_by_id)`; } catch { /* */ }
  try { await sql`CREATE INDEX IF NOT EXISTS idx_discussions_unresolved ON entry_discussions(entry_id, resolved_at)`; } catch { /* */ }

  console.log("entry_discussions migration complete!");
}

main().catch((err) => { console.error("Migration failed:", err); process.exit(1); });
