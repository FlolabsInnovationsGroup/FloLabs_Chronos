/**
 * Rows visible on production Chronos (old rules) but not Hephaestus joined list.
 */
import { createMigrationPool, loadEnvFiles } from "./db-utils";

loadEnvFiles([".env.local", ".env.production.local"]);

function oldChronosVisible(row: {
  status: string;
  role: string;
  email: string;
  notion: string | null;
  is_merged_dup: boolean;
}) {
  if (row.is_merged_dup) return false;
  const status = row.status.toLowerCase();
  if (status === "graduated" || status === "terminated") return false;
  if (row.role === "admin" || row.role === "hr") return true;
  return status === "joined" && Boolean(row.notion?.trim());
}

async function main() {
  const pool = createMigrationPool();
  const { rows } = await pool.query<{
    id: string;
    email: string;
    name: string;
    status: string;
    role: string;
    notion: string | null;
    is_merged_dup: boolean;
  }>(
    `select u.id::text, lower(trim(u.email)) as email, trim(u.name) as name,
            coalesce(u.status, '') as status, coalesce(u.role, '') as role,
            nullif(trim(u.notion_team_member_id), '') as notion,
            exists (
              select 1 from applicant_duplicate_reviews r
              where r.duplicate_applicant_id = u.id and r.status = 'merged'
            ) as is_merged_dup
     from flolabs_users u`,
  );

  const hep = await pool.query<{ id: string }>(
    `select u.id::text as id from flolabs_users u
     where u.id not in (
       select duplicate_applicant_id from applicant_duplicate_reviews where status = 'merged'
     )
     and coalesce(u.status, '') = 'joined'`,
  );
  const hepIds = new Set(hep.rows.map((r) => r.id));

  const oldChronos = rows.filter((r) => oldChronosVisible(r));
  const extra = oldChronos.filter((r) => !hepIds.has(r.id));

  console.log("Old Chronos visible:", oldChronos.length);
  console.log("Hephaestus joined:", hepIds.size);
  console.log("Extra on Chronos (not Hep joined):", extra.length);
  for (const r of extra) {
    console.log(`  ${r.name} <${r.email}> role=${r.role} status=${r.status} merged_dup=${r.is_merged_dup}`);
  }

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
