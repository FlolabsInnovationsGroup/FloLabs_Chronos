import { createPool, createSqlHelpers, loadEnvFiles } from "./db-utils";

loadEnvFiles([".env.local", ".env.production.local"]);

async function main() {
  const pool = createPool();
  const sql = createSqlHelpers(pool);

  try {
    await sql.exec("ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS notion_task_page_id TEXT");
    await sql.exec("ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS notion_task_title TEXT");
    console.log("Migration complete: time_entries notion task fields added.");
  } finally {
    await pool.end();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
