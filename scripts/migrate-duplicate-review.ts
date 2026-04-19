import { createPool, createSqlHelpers, loadEnvFiles } from './db-utils';

loadEnvFiles();

async function main() {
  const pool = createPool();
  const sql = createSqlHelpers(pool);

  try {
    await sql.exec(`
      create table if not exists applicant_duplicate_reviews (
        id uuid primary key default gen_random_uuid(),
        primary_applicant_id uuid not null,
        duplicate_applicant_id uuid not null,
        status text not null default 'pending',
        confidence_score integer not null default 0,
        reasons jsonb not null default '[]'::jsonb,
        reviewed_by_id uuid,
        reviewed_at timestamptz,
        notes text,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        constraint applicant_duplicate_reviews_pair_unique unique (primary_applicant_id, duplicate_applicant_id)
      );
    `);
  } finally {
    await pool.end();
  }
}

main().then(() => {
  console.log('Duplicate review migration complete.');
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
