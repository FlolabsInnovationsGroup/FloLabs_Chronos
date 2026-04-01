/**
 * Migration: add edited_field column to time_entries.
 * Tracks which extreme was edited (start or end) so the other can be locked.
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
  console.log("Running edited_field migration...");

  await sql`
    ALTER TABLE time_entries
    ADD COLUMN IF NOT EXISTS edited_field TEXT DEFAULT NULL
    CHECK (edited_field IN ('start', 'end'))
  `;

  console.log("Migration complete: edited_field column added to time_entries.");
}

main().catch((err) => { console.error("Migration failed:", err); process.exit(1); });
