import { createMigrationPool, loadEnvFiles } from "./db-utils";

loadEnvFiles([".env.local", ".env.production.local"]);

function oldChronosVisible(row: {
  status: string;
  role: string;
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
            nullif(trim(notion_team_member_id), '') as notion,
            exists (
              select 1 from applicant_duplicate_reviews r
              where r.duplicate_applicant_id = u.id and r.status = 'merged'
            ) as is_merged_dup
     from flolabs_users u
     where coalesce(u.status, '') = 'joined'
        or coalesce(u.role, '') in ('admin', 'hr')`,
  );

  const visible = rows.filter((r) => oldChronosVisible(r));
  const byName = new Map<string, typeof visible>();
  for (const row of visible) {
    const key = row.name.toLowerCase();
    const list = byName.get(key) ?? [];
    list.push(row);
    byName.set(key, list);
  }

  const dups = [...byName.entries()].filter(([, list]) => list.length > 1);
  console.log("Old Chronos rules — visible:", visible.length, "duplicate names:", dups.length);
  for (const [name, list] of dups) {
    console.log(`\n${name}:`);
    for (const r of list) {
      console.log(`  ${r.id} | ${r.email} | role=${r.role} | merged_dup=${r.is_merged_dup}`);
    }
  }
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
