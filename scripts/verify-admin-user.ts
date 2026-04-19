import { neon } from '@neondatabase/serverless';

async function main() {
  const adminEmail = process.env.CHRONOS_ADMIN_EMAIL || 'pm@flolabsinnovations.com';
  const databaseUrl = process.env.DATABASE_URL || process.env.FL_CHRONOS_DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL or FL_CHRONOS_DATABASE_URL is required');
  }

  const sql = neon(databaseUrl);
  const res = await sql`select id, email, role from users where lower(email) = lower(${adminEmail}) limit 1`;
  if (!res.length) {
    console.log(JSON.stringify({ ok: false, error: `Admin user not found: ${adminEmail}` }));
    return;
  }
  console.log(JSON.stringify({ ok: true, adminEmail, role: res[0].role, userId: res[0].id }));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
