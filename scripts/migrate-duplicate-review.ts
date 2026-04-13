import { neon } from '@neondatabase/serverless';

const databaseUrl = process.env.DATABASE_URL ?? process.env.FL_CHRONOS_DATABASE_URL ?? process.env.FL_CHRONOS_DATABASE_URL_UNPOOLED;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required');
}

const sql = neon(databaseUrl);

async function main() {
  await sql`
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
  `;
}

main().then(() => {
  console.log('Duplicate review migration complete.');
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
