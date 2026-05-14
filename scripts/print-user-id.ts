/**   pnpm exec tsx scripts/print-user-id.ts tesororeptilipotermius@gmail.com */
import { createMigrationPool, loadEnvFiles } from "./db-utils";

loadEnvFiles([".env.local", ".env.production.local"]);

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("Usage: tsx scripts/print-user-id.ts <email>");
    process.exit(1);
  }
  const pool = createMigrationPool();
  const { rows } = await pool.query<{ id: string; hr_binary_role: boolean; role: string }>(
    `select id, coalesce(hr_binary_role,false) as hr_binary_role, role from flolabs_users where lower(trim(email)) = lower(trim($1)) limit 1`,
    [email],
  );
  console.log(rows[0] ?? "not found");
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
