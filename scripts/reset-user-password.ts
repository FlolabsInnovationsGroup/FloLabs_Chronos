/**
 * One-off: set bcrypt password for a flolabs_users row by email.
 *
 *   pnpm exec tsx scripts/reset-user-password.ts zoom@flomadlabs.com 'your-password'
 */
import bcrypt from "bcryptjs";
import { createMigrationPool, loadEnvFiles } from "./db-utils";

loadEnvFiles([".env.local", ".env.production.local"]);

async function main() {
  const email = process.argv[2];
  const plain = process.argv[3];
  if (!email || !plain) {
    console.error("Usage: tsx scripts/reset-user-password.ts <email> <plain-password>");
    process.exit(1);
  }
  const pool = createMigrationPool();
  const hash = await bcrypt.hash(plain, 10);
  const r = await pool.query(
    `update flolabs_users set password = $1, updated_at = now() where lower(trim(email)) = lower(trim($2))`,
    [hash, email],
  );
  console.log(`Updated ${r.rowCount ?? 0} row(s) for ${email}`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
