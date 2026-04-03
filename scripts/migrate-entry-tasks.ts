import { readFileSync } from "fs";
import { resolve } from "path";
import { neon } from "@neondatabase/serverless";

for (const file of [".env.local", ".env.production.local"]) {
  try {
    const content = readFileSync(resolve(process.cwd(), file), "utf-8");
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
}

async function main() {
  const url = process.env.DATABASE_URL ?? process.env.FL_CHRONOS_DATABASE_URL ?? process.env.FL_CHRONOS_DATABASE_URL_UNPOOLED;
  if (!url) throw new Error("DATABASE_URL is not set");
  const sql = neon(url);
  await sql`ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS notion_task_page_id TEXT`;
  await sql`ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS notion_task_title TEXT`;
  console.log("Migration complete: time_entries notion task fields added.");
}

main().catch((err) => { console.error(err); process.exit(1); });
