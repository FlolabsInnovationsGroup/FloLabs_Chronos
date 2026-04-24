import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!db) return NextResponse.json({ error: "DB not available" }, { status: 503 });

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS user_email_aliases (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        email text NOT NULL UNIQUE,
        is_primary boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const aliasBackfill = await db.execute(sql`
      INSERT INTO user_email_aliases (user_id, email, is_primary, created_at, updated_at)
      SELECT u.id, lower(u.email), true, now(), now()
      FROM users u
      WHERE u.email IS NOT NULL
        AND btrim(u.email) <> ''
        AND NOT EXISTS (
          SELECT 1
          FROM user_email_aliases ua
          WHERE lower(ua.email) = lower(u.email)
        )
    `);

    // Link applicants to existing users by primary applicant email.
    const applicantLinkByEmail = await db.execute(sql`
      UPDATE applicants a
      SET chronos_user_id = u.id, updated_at = now()
      FROM users u
      WHERE a.chronos_user_id IS NULL
        AND lower(a.email) = lower(u.email)
    `);

    // Link applicants to existing users by aliases (including historical emails).
    const applicantLinkByAlias = await db.execute(sql`
      UPDATE applicants a
      SET chronos_user_id = ua.user_id, updated_at = now()
      FROM user_email_aliases ua
      WHERE a.chronos_user_id IS NULL
        AND lower(a.email) = lower(ua.email)
    `);

    // Link applicants to users when HubSpot payload contains a known user/alias email.
    const applicantLinkByHubspot = await db.execute(sql`
      UPDATE applicants a
      SET chronos_user_id = ua.user_id, updated_at = now()
      FROM user_email_aliases ua
      WHERE a.chronos_user_id IS NULL
        AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(COALESCE(a.hubspot_raw_data->'emails', '[]'::jsonb)) AS e(email)
          WHERE lower(e.email) = lower(ua.email)
        )
    `);

    // Ensure every Chronos user has a resolvable applicant row.
    const applicantProvisionedFromUsers = await db.execute(sql`
      INSERT INTO applicants (
        email,
        name,
        role,
        team_id,
        is_active,
        weekly_target_hours,
        stage,
        status,
        synced_to_team_members,
        chronos_user_id,
        created_at,
        updated_at
      )
      SELECT
        lower(u.email) AS email,
        COALESCE(NULLIF(btrim(u.name), ''), lower(u.email)) AS name,
        COALESCE(NULLIF(btrim(u.role), ''), 'member') AS role,
        u.team_id,
        COALESCE(u.is_active, false) AS is_active,
        COALESCE(u.weekly_target_hours, 40) AS weekly_target_hours,
        CASE WHEN COALESCE(u.is_active, false) THEN 'joined' ELSE 'application_submitted' END AS stage,
        CASE WHEN COALESCE(u.is_active, false) THEN 'active' ELSE 'active' END AS status,
        false AS synced_to_team_members,
        u.id AS chronos_user_id,
        now(),
        now()
      FROM users u
      WHERE u.email IS NOT NULL
        AND btrim(u.email) <> ''
        AND NOT EXISTS (
          SELECT 1 FROM applicants a WHERE a.chronos_user_id = u.id
        )
        AND NOT EXISTS (
          SELECT 1 FROM applicants a2 WHERE lower(a2.email) = lower(u.email)
        )
    `);

    // If we had an applicant row by email but no link yet, ensure it's linked now.
    const applicantRelinkPostProvision = await db.execute(sql`
      UPDATE applicants a
      SET chronos_user_id = u.id, updated_at = now()
      FROM users u
      WHERE a.chronos_user_id IS NULL
        AND lower(a.email) = lower(u.email)
    `);

    // Phase 3 safety: ensure canonical applicant FK exists before auditing reads.
    await db.execute(
      sql`ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS applicant_id UUID REFERENCES applicants(id) ON DELETE SET NULL`
    );
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_entries_applicant ON time_entries(applicant_id)`);

    const backfill = await db.execute(sql`
      UPDATE time_entries te
      SET applicant_id = m.applicant_id
      FROM (
        SELECT chronos_user_id AS user_id, min(id) AS applicant_id
        FROM applicants
        WHERE chronos_user_id IS NOT NULL
        GROUP BY chronos_user_id
      ) m
      WHERE te.user_id = m.user_id
        AND (te.applicant_id IS NULL OR te.applicant_id <> m.applicant_id)
    `);

    const counts = await db.execute(sql`
      WITH t AS (
        SELECT
          te.id,
          te.user_id,
          te.applicant_id,
          u.id AS user_exists,
          a.id AS applicant_exists,
          a.chronos_user_id AS applicant_chronos_user_id
        FROM time_entries te
        LEFT JOIN users u ON u.id = te.user_id
        LEFT JOIN applicants a ON a.id = te.applicant_id
      )
      SELECT
        count(*)::int AS total_entries,
        count(*) FILTER (WHERE user_id IS NOT NULL)::int AS entries_with_user_id,
        count(*) FILTER (WHERE user_exists IS NOT NULL)::int AS entries_with_existing_user_fk,
        count(*) FILTER (WHERE applicant_id IS NOT NULL)::int AS entries_with_applicant_id,
        count(*) FILTER (WHERE applicant_exists IS NOT NULL)::int AS entries_with_existing_applicant_fk,
        count(*) FILTER (
          WHERE applicant_id IS NOT NULL
            AND applicant_exists IS NOT NULL
            AND applicant_chronos_user_id = user_id
        )::int AS entries_where_applicant_links_same_user,
        count(*) FILTER (WHERE applicant_id IS NOT NULL AND applicant_exists IS NULL)::int AS orphan_applicant_fk,
        count(*) FILTER (WHERE user_id IS NOT NULL AND user_exists IS NULL)::int AS orphan_user_fk,
        count(*) FILTER (
          WHERE applicant_id IS NOT NULL
            AND applicant_exists IS NOT NULL
            AND applicant_chronos_user_id IS NOT NULL
            AND applicant_chronos_user_id <> user_id
        )::int AS applicant_user_mismatch
      FROM t
    `);

    const summary = (counts as unknown as { rows?: Array<Record<string, unknown>> }).rows?.[0] ?? null;

    return NextResponse.json({
      ok: true,
      aliasBackfillRowCount:
        (aliasBackfill as unknown as { rowCount?: number }).rowCount ??
        (aliasBackfill as unknown as { rowsAffected?: number }).rowsAffected ??
        null,
      applicantLinkByEmailRowCount:
        (applicantLinkByEmail as unknown as { rowCount?: number }).rowCount ??
        (applicantLinkByEmail as unknown as { rowsAffected?: number }).rowsAffected ??
        null,
      applicantLinkByAliasRowCount:
        (applicantLinkByAlias as unknown as { rowCount?: number }).rowCount ??
        (applicantLinkByAlias as unknown as { rowsAffected?: number }).rowsAffected ??
        null,
      applicantLinkByHubspotRowCount:
        (applicantLinkByHubspot as unknown as { rowCount?: number }).rowCount ??
        (applicantLinkByHubspot as unknown as { rowsAffected?: number }).rowsAffected ??
        null,
      applicantProvisionedFromUsersRowCount:
        (applicantProvisionedFromUsers as unknown as { rowCount?: number }).rowCount ??
        (applicantProvisionedFromUsers as unknown as { rowsAffected?: number }).rowsAffected ??
        null,
      applicantRelinkPostProvisionRowCount:
        (applicantRelinkPostProvision as unknown as { rowCount?: number }).rowCount ??
        (applicantRelinkPostProvision as unknown as { rowsAffected?: number }).rowsAffected ??
        null,
      backfillRowCount:
        (backfill as unknown as { rowCount?: number }).rowCount ??
        (backfill as unknown as { rowsAffected?: number }).rowsAffected ??
        null,
      summary,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
