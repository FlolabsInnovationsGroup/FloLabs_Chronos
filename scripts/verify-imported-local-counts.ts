import { createMigrationPool, loadEnvFiles } from "./db-utils";

loadEnvFiles([".env.local", ".env.production.local"]);

async function main() {
  const pool = createMigrationPool();
  const active = await pool.query<{ n: number }>(
    `select count(*)::int as n from flolabs_users
     where lower(email) like '%@imported.local%'
       and coalesce(status, '') <> 'closed'`,
  );
  const closedStill = await pool.query<{ n: number }>(
    `select count(*)::int as n from flolabs_users
     where lower(email) like '%@imported.local%'
       and coalesce(status, '') = 'closed'`,
  );
  const aliases = await pool.query<{ n: number }>(
    `select count(*)::int as n from user_email_aliases
     where lower(email) like '%@imported.local%'`,
  );
  const placeholders = await pool.query<{ n: number }>(
    `select count(*)::int as n from flolabs_users
     where lower(email) like '%@imported.local%'
       and coalesce(status, '') <> 'closed'
       and (name like 'Imported User%' or email like 'imported-user-%')`,
  );
  const namedNoCsv = await pool.query<{ email: string; name: string }>(
    `select email, name from flolabs_users
     where lower(email) like '%@imported.local%'
       and coalesce(status, '') <> 'closed'
       and name not like 'Imported User%'
       and email not like 'imported-user-%'
     order by name
     limit 30`,
  );
  console.log("Active @imported.local primary:", active.rows[0]?.n);
  console.log("Closed still @imported.local primary:", closedStill.rows[0]?.n);
  console.log("@imported.local aliases:", aliases.rows[0]?.n);
  console.log("Active placeholders (Imported User* / imported-user-*):", placeholders.rows[0]?.n);
  console.log("\nSample named active without placeholder pattern:");
  for (const r of namedNoCsv.rows) console.log(`  ${r.email} | ${r.name}`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
