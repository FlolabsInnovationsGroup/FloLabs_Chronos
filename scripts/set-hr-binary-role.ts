/**
 *   pnpm exec tsx scripts/set-hr-binary-role.ts zoom@flomadlabs.com true
 */
import { createMigrationPool, loadEnvFiles } from "./db-utils";

loadEnvFiles([".env.local", ".env.production.local"]);

async function main() {
  const email = process.argv[2];
  const flag = (process.argv[3] ?? "true").toLowerCase() === "true";
  if (!email) {
    console.error("Usage: tsx scripts/set-hr-binary-role.ts <email> [true|false]");
    process.exit(1);
  }
  const pool = createMigrationPool();
  const r = await pool.query(
    `update flolabs_users set hr_binary_role = $1, updated_at = now() where lower(trim(email)) = lower(trim($2))`,
    [flag, email],
  );
  console.log(`Updated ${r.rowCount ?? 0} row(s) hr_binary_role=${flag} for ${email}`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
