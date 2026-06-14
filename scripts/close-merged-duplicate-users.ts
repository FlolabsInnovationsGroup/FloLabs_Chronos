/**
 * Close flolabs_users rows marked as merged duplicates in applicant_duplicate_reviews
 * but still active (status <> closed). Aligns DB with Hephaestus HR list behavior.
 *
 *   pnpm exec tsx scripts/close-merged-duplicate-users.ts --dry-run
 *   pnpm exec tsx scripts/close-merged-duplicate-users.ts
 */
import { createMigrationPool, loadEnvFiles } from "./db-utils";

loadEnvFiles([".env.local", ".env.production.local"]);

const dryRun = process.argv.includes("--dry-run");

async function main() {
  const pool = createMigrationPool();
  const preview = await pool.query<{ id: string; email: string; name: string; status: string }>(
    `select d.id::text, d.email, d.name, d.status
     from applicant_duplicate_reviews r
     join flolabs_users d on d.id = r.duplicate_applicant_id
     where r.status = 'merged' and coalesce(d.status, '') <> 'closed'
     order by d.name`,
  );
  console.log(`${dryRun ? "[dry-run] " : ""}Would close ${preview.rowCount ?? 0} merged duplicate row(s).`);
  for (const row of preview.rows) {
    console.log(`  ${row.name} <${row.email}> (${row.status})`);
  }
  if (!dryRun && (preview.rowCount ?? 0) > 0) {
    const updated = await pool.query(
      `update flolabs_users d
       set status = 'closed', is_active = false, updated_at = now()
       from applicant_duplicate_reviews r
       where d.id = r.duplicate_applicant_id
         and r.status = 'merged'
         and coalesce(d.status, '') <> 'closed'
       returning d.id`,
    );
    console.log(`Closed ${updated.rowCount ?? 0} row(s).`);
  }
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
