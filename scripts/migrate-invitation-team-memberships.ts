import { createPool, createSqlHelpers, loadEnvFiles } from "./db-utils";

loadEnvFiles([".env.local"]);

async function main() {
  const pool = createPool();
  const sql = createSqlHelpers(pool);

  try {
    await sql.exec(`
      CREATE TABLE IF NOT EXISTS invitation_team_memberships (
        invitation_id UUID NOT NULL REFERENCES invitations(id) ON DELETE CASCADE,
        team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ DEFAULT now(),
        PRIMARY KEY (invitation_id, team_id)
      )
    `);

    await sql.exec(`
      INSERT INTO invitation_team_memberships (invitation_id, team_id)
      SELECT id, team_id
      FROM invitations
      WHERE team_id IS NOT NULL
      ON CONFLICT (invitation_id, team_id) DO NOTHING
    `);

    console.log("Migration complete: invitation_team_memberships created and backfilled.");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
