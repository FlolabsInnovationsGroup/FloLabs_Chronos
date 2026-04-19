import { createPool, createSqlHelpers, loadEnvFiles } from "./db-utils";

loadEnvFiles([".env.local"]);

async function main() {
  const pool = createPool();
  const sql = createSqlHelpers(pool);

  try {
    const cols = await sql.query<{ column_name: string }>(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'weekly_target_hours'",
    );

    if (cols.length === 0) {
      await sql.exec("ALTER TABLE users ADD COLUMN weekly_target_hours BIGINT DEFAULT 40");
      console.log("Added weekly_target_hours column to users");
    } else {
      console.log("weekly_target_hours column already exists");
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => { console.error("Migration failed:", err); process.exit(1); });
