/**
 * Compare Chronos directory cohort vs Hephaestus HR status=joined (DB-level).
 *   pnpm exec tsx scripts/compare-directory-hephaestus.ts
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { createMigrationPool, loadEnvFiles } from "./db-utils";

loadEnvFiles([".env.local", ".env.production.local"]);

async function main() {
  const pool = createMigrationPool();

  const hep = await pool.query<{ id: string; email: string; name: string; status: string; role: string }>(
    `select u.id::text, lower(trim(u.email)) as email, trim(u.name) as name, u.status, u.role
     from flolabs_users u
     where u.id not in (
       select duplicate_applicant_id from applicant_duplicate_reviews where status = 'merged'
     )
     and coalesce(u.status, '') = 'joined'
     order by lower(trim(u.name)), u.email`,
  );

  const chronos = await pool.query<{ id: string; email: string; name: string; status: string; role: string; notion: string | null }>(
    `select u.id::text, lower(trim(u.email)) as email, trim(u.name) as name, u.status, u.role,
            nullif(trim(u.notion_team_member_id), '') as notion
     from flolabs_users u
     where u.id not in (
       select duplicate_applicant_id from applicant_duplicate_reviews where status = 'merged'
     )
     and coalesce(u.status, '') = 'joined'
     and coalesce(u.status, '') <> 'closed'
     and lower(trim(u.email)) not like '%@imported.local%'
     and lower(trim(u.email)) not like '%@flolabs.invalid'
     and lower(coalesce(u.status, '')) not in ('graduated', 'terminated')
     order by lower(trim(u.name)), u.email`,
  );

  const hepIds = new Set(hep.rows.map((r) => r.id));
  const chronosIds = new Set(chronos.rows.map((r) => r.id));

  const onlyChronos = chronos.rows.filter((r) => !hepIds.has(r.id));
  const onlyHep = hep.rows.filter((r) => !chronosIds.has(r.id));

  const report = {
    hephaestusJoinedCount: hep.rowCount,
    chronosDirectoryCount: chronos.rowCount,
    onlyOnChronos: onlyChronos,
    onlyOnHephaestus: onlyHep,
    matchedCount: chronos.rows.filter((r) => hepIds.has(r.id)).length,
  };

  const out = join(process.cwd(), "test-results", "directory-parity-db.json");
  writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.log(`\nWrote ${out}`);

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
