import { createPool, createSqlHelpers, loadEnvFiles } from './db-utils';

loadEnvFiles();

async function main() {
  const adminEmail = process.env.CHRONOS_ADMIN_EMAIL || 'pm@flolabsinnovations.com';
  const pool = createPool();
  const sql = createSqlHelpers(pool);

  try {
    const res = await sql.query<{ id: string; email: string; role: string }>(
      'select id, email, role from users where lower(email) = lower($1) limit 1',
      [adminEmail],
    );
    if (!res.length) {
      console.log(JSON.stringify({ ok: false, error: `Admin user not found: ${adminEmail}` }));
      return;
    }
    console.log(JSON.stringify({ ok: true, adminEmail, role: res[0].role, userId: res[0].id }));
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
