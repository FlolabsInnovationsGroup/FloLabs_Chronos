export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  try {
    const { pool } = await import("@/lib/db");
    if (!pool) {
      console.warn("[instrumentation] DB not available, skipping migrations");
      return;
    }

    const client = await pool.connect();
    try {
      // Apply schema changes idempotently. Drizzle's migrate() fails when the
      // production DB was provisioned outside the migration system (no
      // __drizzle_migrations table), so we run each ALTER directly with
      // IF NOT EXISTS guards.
      await client.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_login_at" timestamp with time zone`);
      await client.query(`ALTER TABLE "applicants" ALTER COLUMN "status" SET DEFAULT 'joined'`);
      await client.query(`ALTER TABLE "discussion_replies" ADD COLUMN IF NOT EXISTS "author_flolabs_id" uuid`);
      await client.query(`ALTER TABLE "discussion_replies" ADD COLUMN IF NOT EXISTS "author_applicant_id" uuid`);
      await client.query(`ALTER TABLE "entry_discussions" ADD COLUMN IF NOT EXISTS "started_by_flolabs_id" uuid`);
      await client.query(`ALTER TABLE "entry_discussions" ADD COLUMN IF NOT EXISTS "started_by_applicant_id" uuid`);
      await client.query(`ALTER TABLE "entry_discussions" ADD COLUMN IF NOT EXISTS "resolved_by_flolabs_id" uuid`);
      await client.query(`ALTER TABLE "entry_discussions" ADD COLUMN IF NOT EXISTS "resolved_by_applicant_id" uuid`);
      await client.query(`ALTER TABLE "tags" ADD COLUMN IF NOT EXISTS "flolabs_id" uuid`);
      await client.query(`ALTER TABLE "tags" ADD COLUMN IF NOT EXISTS "applicant_id" uuid`);
      await client.query(`ALTER TABLE "time_entries" ADD COLUMN IF NOT EXISTS "flolabs_id" uuid`);
      await client.query(`ALTER TABLE "time_entries" ADD COLUMN IF NOT EXISTS "applicant_id" uuid`);
      console.log("[instrumentation] DB migrations applied");
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("[instrumentation] Migration failed:", err);
  }
}
