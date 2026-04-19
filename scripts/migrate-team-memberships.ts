import { createPool, createSqlHelpers, loadEnvFiles } from "./db-utils";

loadEnvFiles([".env.local"]);

async function main() {
  const pool = createPool();
  const sql = createSqlHelpers(pool);

  try {
    console.log("Running team memberships migration...");

    await sql.exec(`
      CREATE TABLE IF NOT EXISTS team_memberships (
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ DEFAULT now(),
        PRIMARY KEY (user_id, team_id)
      )
    `);

    await sql.exec(`
      INSERT INTO team_memberships (user_id, team_id)
      SELECT id, team_id
      FROM users
      WHERE team_id IS NOT NULL
      ON CONFLICT (user_id, team_id) DO NOTHING
    `);

    console.log("Migration complete: team_memberships created and backfilled.");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
