import { createPool, createSqlHelpers, loadEnvFiles } from "./db-utils";

loadEnvFiles([".env.local"]);

async function main() {
  const pool = createPool();
  const sql = createSqlHelpers(pool);

  try {
    await sql.exec("ALTER TABLE invitations ADD COLUMN IF NOT EXISTS notion_team_member_id TEXT");

    const rows = await sql.query<{ column_name: string }>(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'invitations'
        AND column_name = 'notion_team_member_id'
    `);
    if (rows.length === 0) {
      throw new Error("Column invitations.notion_team_member_id is still missing after ALTER.");
    }

    console.log("Migration complete: invitations.notion_team_member_id ensured (TEXT).");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
