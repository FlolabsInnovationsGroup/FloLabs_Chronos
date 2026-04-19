import { createPool, createSqlHelpers, loadEnvFiles } from "./db-utils";

loadEnvFiles([".env.local", ".env.production.local"]);

async function main() {
  const pool = createPool();
  const sql = createSqlHelpers(pool);

  try {
    await sql.exec(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token text NOT NULL,
        expires_at timestamptz NOT NULL,
        used_at timestamptz,
        created_at timestamptz DEFAULT now()
      )
    `);
    await sql.exec("CREATE UNIQUE INDEX IF NOT EXISTS password_reset_tokens_token_unique ON password_reset_tokens(token)");

    console.log("Migration complete: password_reset_tokens created.");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
