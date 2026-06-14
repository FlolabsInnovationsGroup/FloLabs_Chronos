import { createMigrationPool, loadEnvFiles } from "./db-utils";

loadEnvFiles([".env.local", ".env.production.local"]);

const nameArg = process.argv.find((a) => a.startsWith("--name="));
const search = (nameArg?.split("=").slice(1).join("=") ?? "Daniela Torres").trim().toLowerCase();

async function main() {
  const pool = createMigrationPool();
  const users = await pool.query(
    `select id::text, email, name, status, role, is_active,
            notion_team_member_id, notion_team_member_page_url,
            hubspot_record_id, created_at, updated_at
     from flolabs_users
     where lower(name) like '%' || $1 || '%'
        or lower(concat_ws(' ', first_name, last_name)) like '%' || $1 || '%'
     order by created_at`,
    [search],
  );
  console.log(`flolabs_users matching "${search}":`, users.rowCount);
  for (const r of users.rows) console.log(JSON.stringify(r));

  const ids = users.rows.map((r: { id: string }) => r.id);
  if (ids.length > 0) {
    const reviews = await pool.query(
      `select r.*, p.email as primary_email, p.name as primary_name,
              d.email as dup_email, d.name as dup_name, d.status as dup_status
       from applicant_duplicate_reviews r
       left join flolabs_users p on p.id = r.primary_applicant_id
       left join flolabs_users d on d.id = r.duplicate_applicant_id
       where r.primary_applicant_id = any($1::uuid[])
          or r.duplicate_applicant_id = any($1::uuid[])`,
      [ids],
    );
    console.log("\napplicant_duplicate_reviews:", reviews.rowCount);
    for (const r of reviews.rows) console.log(JSON.stringify(r));
  }

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
