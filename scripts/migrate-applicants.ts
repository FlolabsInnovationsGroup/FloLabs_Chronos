import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';

async function main() {
  if (!db) throw new Error('Database is not configured');

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS applicants (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      external_applicant_id TEXT,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      phone TEXT,
      country TEXT,
      state_region TEXT,
      city TEXT,
      date_of_birth TEXT,
      gender TEXT,
      linkedin_url TEXT,
      education TEXT,
      field_of_study TEXT,
      current_job_title TEXT,
      company_name TEXT,
      role_applied_for TEXT,
      stage TEXT NOT NULL DEFAULT 'application_submitted',
      status TEXT NOT NULL DEFAULT 'active',
      joined_at TIMESTAMPTZ DEFAULT now(),
      last_website_visit TIMESTAMPTZ,
      source TEXT,
      hubspot_record_id TEXT,
      hubspot_status TEXT,
      hubspot_owner TEXT,
      hubspot_lifecycle_stage TEXT,
      hubspot_lead_status TEXT,
      hubspot_last_modified_at TIMESTAMPTZ,
      hubspot_raw_data JSONB,
      synced_to_team_members BOOLEAN NOT NULL DEFAULT false,
      chronos_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    );
  `);

  await db.execute(sql`ALTER TABLE applicants ADD COLUMN IF NOT EXISTS state_region TEXT;`);
  await db.execute(sql`ALTER TABLE applicants ADD COLUMN IF NOT EXISTS date_of_birth TEXT;`);
  await db.execute(sql`ALTER TABLE applicants ADD COLUMN IF NOT EXISTS gender TEXT;`);
  await db.execute(sql`ALTER TABLE applicants ADD COLUMN IF NOT EXISTS education TEXT;`);
  await db.execute(sql`ALTER TABLE applicants ADD COLUMN IF NOT EXISTS field_of_study TEXT;`);
  await db.execute(sql`ALTER TABLE applicants ADD COLUMN IF NOT EXISTS current_job_title TEXT;`);
  await db.execute(sql`ALTER TABLE applicants ADD COLUMN IF NOT EXISTS company_name TEXT;`);
  await db.execute(sql`ALTER TABLE applicants ADD COLUMN IF NOT EXISTS hubspot_record_id TEXT;`);
  await db.execute(sql`ALTER TABLE applicants ADD COLUMN IF NOT EXISTS hubspot_status TEXT;`);
  await db.execute(sql`ALTER TABLE applicants ADD COLUMN IF NOT EXISTS hubspot_owner TEXT;`);
  await db.execute(sql`ALTER TABLE applicants ADD COLUMN IF NOT EXISTS hubspot_lifecycle_stage TEXT;`);
  await db.execute(sql`ALTER TABLE applicants ADD COLUMN IF NOT EXISTS hubspot_lead_status TEXT;`);
  await db.execute(sql`ALTER TABLE applicants ADD COLUMN IF NOT EXISTS hubspot_last_modified_at TIMESTAMPTZ;`);
  await db.execute(sql`ALTER TABLE applicants ADD COLUMN IF NOT EXISTS hubspot_raw_data JSONB;`);

  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_applicants_stage ON applicants(stage);`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_applicants_status ON applicants(status);`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_applicants_chronos_user_id ON applicants(chronos_user_id);`);

  console.log('Applicants table migration complete.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
