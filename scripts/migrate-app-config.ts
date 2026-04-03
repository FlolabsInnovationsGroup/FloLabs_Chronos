import { neon } from "@neondatabase/serverless";

const connectionString =
  process.env.DATABASE_URL ??
  process.env.FL_CHRONOS_DATABASE_URL ??
  process.env.FL_CHRONOS_DATABASE_URL_UNPOOLED;

if (!connectionString) {
  throw new Error("DATABASE_URL not set");
}

const sql = neon(connectionString);

async function main() {
  await sql`
    CREATE TABLE IF NOT EXISTS app_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      is_secret BOOLEAN NOT NULL DEFAULT false,
      updated_by UUID REFERENCES users(id),
      updated_at TIMESTAMPTZ DEFAULT now()
    )
  `;

  await sql`CREATE INDEX IF NOT EXISTS idx_app_config_updated_at ON app_config(updated_at)`;

  console.log("Migration complete: app_config table ready.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
