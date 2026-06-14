/**
 * Close joined rows with archived/imported placeholder emails (not valid directory identities).
 *
 *   pnpm exec tsx scripts/close-junk-joined-directory-rows.ts --dry-run
 *   pnpm exec tsx scripts/close-junk-joined-directory-rows.ts
 */
import { createMigrationPool, loadEnvFiles } from "./db-utils";

loadEnvFiles([".env.local", ".env.production.local"]);
const dryRun = process.argv.includes("--dry-run");

async function main() {
  const pool = createMigrationPool();
  const preview = await pool.query<{ id: string; email: string; name: string }>(
    `select id::text, lower(trim(email)) as email, trim(name) as name
     from flolabs_users
     where coalesce(status, '') = 'joined'
       and (
         lower(trim(email)) like '%@imported.local%'
         or lower(trim(email)) like '%@flolabs.invalid'
       )
     order by name`,
  );
  console.log(`${dryRun ? "[dry-run] " : ""}Would close ${preview.rowCount ?? 0} junk joined row(s).`);
  for (const row of preview.rows) {
    console.log(`  ${row.name} <${row.email}>`);
  }
  if (!dryRun && (preview.rowCount ?? 0) > 0) {
    const updated = await pool.query(
      `update flolabs_users
       set status = 'closed', is_active = false, updated_at = now()
       where coalesce(status, '') = 'joined'
         and (
           lower(trim(email)) like '%@imported.local%'
           or lower(trim(email)) like '%@flolabs.invalid'
         )
       returning id`,
    );
    console.log(`Closed ${updated.rowCount ?? 0} row(s).`);
  }
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
