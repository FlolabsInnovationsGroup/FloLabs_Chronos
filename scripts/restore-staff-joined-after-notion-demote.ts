/**
 * Re-enable joined + active for internal staff wrongly demoted by reset-joined-status-without-notion-link.
 *
 *   pnpm exec tsx scripts/restore-staff-joined-after-notion-demote.ts --dry-run
 *   pnpm exec tsx scripts/restore-staff-joined-after-notion-demote.ts
 */
import { createMigrationPool, loadEnvFiles } from "./db-utils";

loadEnvFiles([".env.local", ".env.production.local"]);
const dryRun = process.argv.includes("--dry-run");

const STAFF_WHERE = `
  lower(coalesce(status, '')) = 'applying'
  and (
    coalesce(hr_binary_role, false) = true
    or lower(coalesce(role, '')) in ('admin', 'hr', 'team_lead')
    or lower(trim(email)) like '%@flolabsrd.com'
    or lower(trim(email)) like '%@flolabsinnovations.com'
    or lower(trim(email)) like '%@flomadlabs.com'
  )
`;

async function main() {
  const pool = createMigrationPool();
  const preview = await pool.query<{ email: string; role: string; status: string }>(
    `select lower(trim(email)) as email, role, status from flolabs_users where ${STAFF_WHERE} order by email`,
  );
  console.log(`${dryRun ? "[dry-run] " : ""}Would restore ${preview.rowCount ?? 0} staff row(s):`);
  for (const row of preview.rows) {
    console.log(`  ${row.email} role=${row.role}`);
  }
  if (!dryRun && (preview.rowCount ?? 0) > 0) {
    const updated = await pool.query(
      `update flolabs_users
       set status = 'joined', is_active = true, updated_at = now()
       where ${STAFF_WHERE}
       returning id`,
    );
    console.log(`Restored ${updated.rowCount ?? 0} row(s).`);
  }
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
