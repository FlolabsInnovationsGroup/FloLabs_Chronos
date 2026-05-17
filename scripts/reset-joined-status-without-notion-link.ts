/**
 * Demote mistaken `joined` rows that have no Notion Team Member link back to `applying`.
 * Fixes bulk HubSpot CSV import / schema-default fallout (see merge-legacy-and-hubspot-csv-contacts).
 *
 *   pnpm exec tsx scripts/reset-joined-status-without-notion-link.ts --dry-run
 *   pnpm exec tsx scripts/reset-joined-status-without-notion-link.ts
 */
import { createMigrationPool, loadEnvFiles } from "./db-utils";

loadEnvFiles([".env.local", ".env.production.local"]);
const dryRun = process.argv.includes("--dry-run");

const NOT_LINKED_WHERE = `
  lower(coalesce(status, '')) in ('joined', 'active')
  and coalesce(nullif(trim(notion_team_member_id), ''), '') = ''
  and coalesce(nullif(trim(notion_team_member_page_url), ''), '') = ''
  and lower(coalesce(status, '')) not in ('graduated', 'terminated', 'closed')
`;

async function main() {
  const pool = createMigrationPool();

  if (!dryRun) {
    await pool.query(`alter table flolabs_users alter column status set default 'applying'`);
  }

  const preview = await pool.query<{
    id: string;
    email: string;
    name: string;
    status: string;
    source: string | null;
  }>(
    `select id::text, lower(trim(email)) as email, trim(name) as name, status, source
     from flolabs_users
     where ${NOT_LINKED_WHERE}
     order by lower(name), email
     limit 50`,
  );

  const count = await pool.query<{ n: number }>(
    `select count(*)::int as n from flolabs_users where ${NOT_LINKED_WHERE}`,
  );
  const total = count.rows[0]?.n ?? 0;

  console.log(`${dryRun ? "[dry-run] " : ""}Would demote ${total} user(s) from joined/active → applying (no Notion link).`);
  for (const row of preview.rows) {
    console.log(`  ${row.name} <${row.email}> status=${row.status} source=${row.source ?? "—"}`);
  }
  const shown = preview.rows.length;
  if (total > shown) {
    console.log(`  … and ${total - shown} more`);
  }

  if (!dryRun && total > 0) {
    const updated = await pool.query(
      `update flolabs_users
       set status = 'applying',
           stage = case
             when lower(coalesce(stage, '')) in ('joined', 'active', 'chronos_synced') then 'application_submitted'
             else stage
           end,
           is_active = false,
           updated_at = now()
       where ${NOT_LINKED_WHERE}
       returning id`,
    );
    console.log(`\nDemoted ${updated.rowCount ?? 0} row(s).`);
  }

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
