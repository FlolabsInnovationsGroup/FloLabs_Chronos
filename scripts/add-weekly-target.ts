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
} catch { /* */ }

import { neon } from "@neondatabase/serverless";

async function main() {
  const url =
    process.env.DATABASE_URL ??
    process.env.FL_CHRONOS_DATABASE_URL ??
    process.env.FL_CHRONOS_DATABASE_URL_UNPOOLED;
  if (!url) { console.error("DATABASE_URL is not set"); process.exit(1); }

  const sql = neon(url);

  const cols = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'weekly_target_hours'
  `;

  if (cols.length === 0) {
    await sql`ALTER TABLE users ADD COLUMN weekly_target_hours BIGINT DEFAULT 40`;
    console.log("Added weekly_target_hours column to users");
  } else {
    console.log("weekly_target_hours column already exists");
  }
}

main().catch((err) => { console.error("Migration failed:", err); process.exit(1); });
