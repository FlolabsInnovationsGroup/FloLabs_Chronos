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
} catch {}

import { neon } from "@neondatabase/serverless";

async function main() {
  const url = process.env.DATABASE_URL ?? process.env.FL_CHRONOS_DATABASE_URL ?? process.env.FL_CHRONOS_DATABASE_URL_UNPOOLED;
  if (!url) throw new Error("DATABASE_URL is not set");
  const sql = neon(url);

  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS notion_team_member_id TEXT`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS users_notion_team_member_id_unique ON users(notion_team_member_id) WHERE notion_team_member_id IS NOT NULL`;

  console.log("Migration complete: users.notion_team_member_id added.");
}

main().catch((err) => { console.error(err); process.exit(1); });
