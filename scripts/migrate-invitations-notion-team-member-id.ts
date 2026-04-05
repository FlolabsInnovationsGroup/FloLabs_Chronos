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
} catch {
  /* optional .env.local */
}

import { neon } from "@neondatabase/serverless";

async function main() {
  const url =
    process.env.DATABASE_URL ?? process.env.FL_CHRONOS_DATABASE_URL ?? process.env.FL_CHRONOS_DATABASE_URL_UNPOOLED;
  if (!url) throw new Error("DATABASE_URL is not set");
  const sql = neon(url);

  await sql`ALTER TABLE invitations ADD COLUMN IF NOT EXISTS notion_team_member_id TEXT`;

  const rows = await sql`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'invitations'
      AND column_name = 'notion_team_member_id'
  `;
  if (rows.length === 0) {
    throw new Error("Column invitations.notion_team_member_id is still missing after ALTER.");
  }

  console.log("Migration complete: invitations.notion_team_member_id ensured (TEXT).");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
