import { createPool, createSqlHelpers, loadEnvFiles } from "./db-utils";

loadEnvFiles([".env.local", ".env.production.local"]);

async function main() {
  const pool = createPool();
  const sql = createSqlHelpers(pool);

  try {
    await sql.exec("ALTER TABLE time_entries ALTER COLUMN project_id DROP NOT NULL");
    console.log("Migration complete: time_entries.project_id is now optional.");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
