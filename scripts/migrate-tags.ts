/**
 * Manual migration script for the tag refactor.
 * Handles: drop old tag constraints, add userId + createdAt columns,
 * remove color, create time_entry_tags, drop tagId from time_entries.
 */

import { createPool, createSqlHelpers, loadEnvFiles } from "./db-utils";

loadEnvFiles([".env.local"]);

async function main() {
  const pool = createPool();
  const sql = createSqlHelpers(pool);

  try {
    console.log("Running tag migration...");

    console.log("1. Nulling out tag_id references on time_entries...");
    await sql.exec("UPDATE time_entries SET tag_id = NULL WHERE tag_id IS NOT NULL");

    console.log("2. Dropping old tag constraints...");
    try { await sql.exec("DROP INDEX IF EXISTS tags_name_unique"); } catch {}
    try { await sql.exec("DROP INDEX IF EXISTS idx_entries_tag"); } catch {}
    try { await sql.exec("ALTER TABLE tags DROP CONSTRAINT IF EXISTS tags_name_unique"); } catch {}

    console.log("3. Dropping tag FK and truncating old tags...");
    try { await sql.exec("ALTER TABLE time_entries DROP CONSTRAINT IF EXISTS time_entries_tag_id_tags_id_fk"); } catch {}
    try { await sql.exec("ALTER TABLE time_entries DROP COLUMN IF EXISTS tag_id"); } catch {}
    await sql.exec("TRUNCATE TABLE tags");

    console.log("4. Altering tags table...");
    try { await sql.exec("ALTER TABLE tags DROP COLUMN IF EXISTS color"); } catch {}

    const userIdExists = await sql.query<{ column_name: string }>(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'tags' AND column_name = 'user_id'
    `);
    if (userIdExists.length === 0) {
      await sql.exec("ALTER TABLE tags ADD COLUMN user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE");
    }

    const createdAtExists = await sql.query<{ column_name: string }>(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'tags' AND column_name = 'created_at'
    `);
    if (createdAtExists.length === 0) {
      await sql.exec("ALTER TABLE tags ADD COLUMN created_at TIMESTAMPTZ DEFAULT now()");
    }

    console.log("5. Creating new indexes on tags...");
    try { await sql.exec("CREATE UNIQUE INDEX IF NOT EXISTS tags_name_user_unique ON tags(name, user_id)"); } catch {}
    try { await sql.exec("CREATE INDEX IF NOT EXISTS idx_tags_user ON tags(user_id)"); } catch {}

    console.log("6. Creating time_entry_tags join table...");
    await sql.exec(`
      CREATE TABLE IF NOT EXISTS time_entry_tags (
        time_entry_id UUID NOT NULL REFERENCES time_entries(id) ON DELETE CASCADE,
        tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
        PRIMARY KEY (time_entry_id, tag_id)
      )
    `);
    try { await sql.exec("CREATE INDEX IF NOT EXISTS idx_entry_tags_entry ON time_entry_tags(time_entry_id)"); } catch {}
    try { await sql.exec("CREATE INDEX IF NOT EXISTS idx_entry_tags_tag ON time_entry_tags(tag_id)"); } catch {}

    console.log("Tag migration complete!");
  } finally {
    await pool.end();
  }
}

main().catch((err) => { console.error("Migration failed:", err); process.exit(1); });
