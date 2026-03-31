/**
 * Manual migration script for the tag refactor.
 * Handles: drop old tag constraints, add userId + createdAt columns,
 * remove color, create time_entry_tags, drop tagId from time_entries.
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
  console.log("Running tag migration...");

  // 1. Null out tag_id on time_entries that reference old tags (preserve entries)
  console.log("1. Nulling out tag_id references on time_entries...");
  await sql`UPDATE time_entries SET tag_id = NULL WHERE tag_id IS NOT NULL`;

  // 2. Drop old indexes/constraints on tags table
  console.log("2. Dropping old tag constraints...");
  try { await sql`DROP INDEX IF EXISTS tags_name_unique`; } catch { /* */ }
  try { await sql`DROP INDEX IF EXISTS idx_entries_tag`; } catch { /* */ }
  try { await sql`ALTER TABLE tags DROP CONSTRAINT IF EXISTS tags_name_unique`; } catch { /* */ }

  // 3. Drop FK from time_entries to tags, then truncate old tags
  console.log("3. Dropping tag FK and truncating old tags...");
  try { await sql`ALTER TABLE time_entries DROP CONSTRAINT IF EXISTS time_entries_tag_id_tags_id_fk`; } catch { /* */ }
  try { await sql`ALTER TABLE time_entries DROP COLUMN IF EXISTS tag_id`; } catch { /* */ }
  await sql`TRUNCATE TABLE tags`;

  // 4. Drop color column if exists, add user_id and created_at if not exists
  console.log("4. Altering tags table...");
  try { await sql`ALTER TABLE tags DROP COLUMN IF EXISTS color`; } catch { /* */ }

  // Check if user_id column exists
  const userIdExists = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'tags' AND column_name = 'user_id'
  `;
  if (userIdExists.length === 0) {
    await sql`ALTER TABLE tags ADD COLUMN user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE`;
  }

  const createdAtExists = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'tags' AND column_name = 'created_at'
  `;
  if (createdAtExists.length === 0) {
    await sql`ALTER TABLE tags ADD COLUMN created_at TIMESTAMPTZ DEFAULT now()`;
  }

  // 5. Create new unique index on (name, user_id)
  console.log("5. Creating new indexes on tags...");
  try { await sql`CREATE UNIQUE INDEX IF NOT EXISTS tags_name_user_unique ON tags(name, user_id)`; } catch { /* */ }
  try { await sql`CREATE INDEX IF NOT EXISTS idx_tags_user ON tags(user_id)`; } catch { /* */ }

  // 6. Create time_entry_tags join table
  console.log("6. Creating time_entry_tags join table...");
  await sql`
    CREATE TABLE IF NOT EXISTS time_entry_tags (
      time_entry_id UUID NOT NULL REFERENCES time_entries(id) ON DELETE CASCADE,
      tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY (time_entry_id, tag_id)
    )
  `;
  try { await sql`CREATE INDEX IF NOT EXISTS idx_entry_tags_entry ON time_entry_tags(time_entry_id)`; } catch { /* */ }
  try { await sql`CREATE INDEX IF NOT EXISTS idx_entry_tags_tag ON time_entry_tags(tag_id)`; } catch { /* */ }

  // 7. tag_id already dropped in step 3

  console.log("Tag migration complete!");
}

main().catch((err) => { console.error("Migration failed:", err); process.exit(1); });
