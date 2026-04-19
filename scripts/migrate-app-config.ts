import { createPool, createSqlHelpers, loadEnvFiles } from "./db-utils";

loadEnvFiles();

async function main() {
  const pool = createPool();
  const sql = createSqlHelpers(pool);

  try {
    await sql.exec(`
      CREATE TABLE IF NOT EXISTS app_config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        is_secret BOOLEAN NOT NULL DEFAULT false,
        updated_by UUID REFERENCES users(id),
        updated_at TIMESTAMPTZ DEFAULT now()
      )
    `);

    await sql.exec("CREATE INDEX IF NOT EXISTS idx_app_config_updated_at ON app_config(updated_at)");

    console.log("Migration complete: app_config table ready.");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
