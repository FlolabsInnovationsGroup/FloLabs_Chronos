import { createPool, createSqlHelpers, loadEnvFiles } from "./db-utils";

loadEnvFiles([".env.local"]);

async function main() {
  const pool = createPool();
  const sql = createSqlHelpers(pool);

  try {
    await sql.exec("ALTER TABLE users ADD COLUMN IF NOT EXISTS notion_team_member_id TEXT");
    await sql.exec("CREATE UNIQUE INDEX IF NOT EXISTS users_notion_team_member_id_unique ON users(notion_team_member_id) WHERE notion_team_member_id IS NOT NULL");

    console.log("Migration complete: users.notion_team_member_id added.");
  } finally {
    await pool.end();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
