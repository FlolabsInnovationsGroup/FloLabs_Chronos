import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Idempotent maintenance for the unified `flolabs_users` identity model.
 * Legacy applicant↔user linking SQL was removed; see `scripts/migrate-to-flolabs-users.sql` for RDS cutover.
 */
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
        user_id uuid NOT NULL REFERENCES flolabs_users(id) ON DELETE CASCADE,
        email text NOT NULL UNIQUE,
        is_primary boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const aliasBackfill = await db.execute(sql`
      INSERT INTO user_email_aliases (user_id, email, is_primary, created_at, updated_at)
      SELECT u.id, lower(u.email), true, now(), now()
      FROM flolabs_users u
      WHERE u.email IS NOT NULL
        AND btrim(u.email) <> ''
        AND NOT EXISTS (
          SELECT 1
          FROM user_email_aliases ua
          WHERE lower(ua.email) = lower(u.email)
        )
    `);

    const backfillTeamMemberships = await db.execute(sql`
      INSERT INTO team_memberships (user_id, team_id, created_at)
      SELECT u.id, u.team_id, now()
      FROM flolabs_users u
      WHERE u.team_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM team_memberships tm
          WHERE tm.user_id = u.id
            AND tm.team_id = u.team_id
        )
    `);

    await db.execute(
      sql`ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS applicant_id UUID REFERENCES flolabs_users(id) ON DELETE SET NULL`
    );
    await db.execute(
      sql`ALTER TABLE tags ADD COLUMN IF NOT EXISTS applicant_id UUID REFERENCES flolabs_users(id) ON DELETE SET NULL`
    );
    await db.execute(
      sql`ALTER TABLE entry_discussions ADD COLUMN IF NOT EXISTS started_by_applicant_id UUID REFERENCES flolabs_users(id) ON DELETE SET NULL`
    );
    await db.execute(
      sql`ALTER TABLE entry_discussions ADD COLUMN IF NOT EXISTS resolved_by_applicant_id UUID REFERENCES flolabs_users(id) ON DELETE SET NULL`
    );
    await db.execute(
      sql`ALTER TABLE discussion_replies ADD COLUMN IF NOT EXISTS author_applicant_id UUID REFERENCES flolabs_users(id) ON DELETE SET NULL`
    );

    await db.execute(
      sql`ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS flolabs_id UUID REFERENCES flolabs_users(id) ON DELETE SET NULL`
    );
    await db.execute(
      sql`ALTER TABLE tags ADD COLUMN IF NOT EXISTS flolabs_id UUID REFERENCES flolabs_users(id) ON DELETE SET NULL`
    );
    await db.execute(
      sql`ALTER TABLE entry_discussions ADD COLUMN IF NOT EXISTS started_by_flolabs_id UUID REFERENCES flolabs_users(id) ON DELETE SET NULL`
    );
    await db.execute(
      sql`ALTER TABLE entry_discussions ADD COLUMN IF NOT EXISTS resolved_by_flolabs_id UUID REFERENCES flolabs_users(id) ON DELETE SET NULL`
    );
    await db.execute(
      sql`ALTER TABLE discussion_replies ADD COLUMN IF NOT EXISTS author_flolabs_id UUID REFERENCES flolabs_users(id) ON DELETE SET NULL`
    );

    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_entries_applicant ON time_entries(applicant_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_tags_applicant ON tags(applicant_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_discussions_started_by_applicant ON entry_discussions(started_by_applicant_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_discussions_resolved_by_applicant ON entry_discussions(resolved_by_applicant_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_replies_author_applicant ON discussion_replies(author_applicant_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_entries_flolabs ON time_entries(flolabs_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_tags_flolabs ON tags(flolabs_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_discussions_started_by_flolabs ON entry_discussions(started_by_flolabs_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_discussions_resolved_by_flolabs ON entry_discussions(resolved_by_flolabs_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_replies_author_flolabs ON discussion_replies(author_flolabs_id)`);

    const entriesAlign = await db.execute(sql`
      UPDATE time_entries te
      SET
        applicant_id = COALESCE(te.applicant_id, te.user_id),
        flolabs_id = COALESCE(te.flolabs_id, te.applicant_id, te.user_id)
      WHERE te.user_id IS NOT NULL
        AND (te.applicant_id IS DISTINCT FROM te.user_id OR te.flolabs_id IS NULL)
    `);

    const tagsAlign = await db.execute(sql`
      UPDATE tags t
      SET applicant_id = COALESCE(t.applicant_id, t.user_id),
          flolabs_id = COALESCE(t.flolabs_id, t.applicant_id, t.user_id)
      WHERE t.user_id IS NOT NULL
        AND (t.applicant_id IS DISTINCT FROM t.user_id OR t.flolabs_id IS NULL)
    `);

    const discussionsStartedAlign = await db.execute(sql`
      UPDATE entry_discussions d
      SET started_by_applicant_id = COALESCE(d.started_by_applicant_id, d.started_by_id),
          started_by_flolabs_id = COALESCE(d.started_by_flolabs_id, d.started_by_applicant_id, d.started_by_id)
      WHERE d.started_by_id IS NOT NULL
        AND (d.started_by_applicant_id IS DISTINCT FROM d.started_by_id OR d.started_by_flolabs_id IS NULL)
    `);

    const discussionsResolvedAlign = await db.execute(sql`
      UPDATE entry_discussions d
      SET resolved_by_applicant_id = COALESCE(d.resolved_by_applicant_id, d.resolved_by_id),
          resolved_by_flolabs_id = COALESCE(d.resolved_by_flolabs_id, d.resolved_by_applicant_id, d.resolved_by_id)
      WHERE d.resolved_by_id IS NOT NULL
        AND (d.resolved_by_applicant_id IS DISTINCT FROM d.resolved_by_id OR d.resolved_by_flolabs_id IS NULL)
    `);

    const repliesAlign = await db.execute(sql`
      UPDATE discussion_replies r
      SET author_applicant_id = COALESCE(r.author_applicant_id, r.author_id),
          author_flolabs_id = COALESCE(r.author_flolabs_id, r.author_applicant_id, r.author_id)
      WHERE r.author_id IS NOT NULL
        AND (r.author_applicant_id IS DISTINCT FROM r.author_id OR r.author_flolabs_id IS NULL)
    `);

    const normalizeActiveStatus = await db.execute(sql`
      UPDATE flolabs_users
      SET status = 'joined', updated_at = now()
      WHERE lower(coalesce(status, '')) = 'active'
    `);
    const normalizeActiveStage = await db.execute(sql`
      UPDATE flolabs_users
      SET stage = 'joined', updated_at = now()
      WHERE lower(coalesce(stage, '')) = 'active'
    `);

    const counts = await db.execute(sql`
      WITH t AS (
        SELECT
          te.id,
          te.user_id,
          te.applicant_id,
          te.flolabs_id,
          u.id AS user_exists
        FROM time_entries te
        LEFT JOIN flolabs_users u ON u.id = te.user_id
      )
      SELECT
        count(*)::int AS total_entries,
        count(*) FILTER (WHERE user_id IS NOT NULL)::int AS entries_with_user_id,
        count(*) FILTER (WHERE user_exists IS NOT NULL)::int AS entries_with_existing_user_fk,
        count(*) FILTER (WHERE applicant_id IS NOT NULL)::int AS entries_with_applicant_id,
        count(*) FILTER (WHERE flolabs_id IS NOT NULL)::int AS entries_with_flolabs_id,
        count(*) FILTER (WHERE applicant_id IS NOT NULL AND applicant_id = user_id)::int AS entries_where_applicant_links_same_user
      FROM t
    `);

    const summary = (counts as unknown as { rows?: Array<Record<string, unknown>> }).rows?.[0] ?? null;

    const rowCount = (r: unknown) =>
      (r as { rowCount?: number }).rowCount ?? (r as { rowsAffected?: number }).rowsAffected ?? null;

    return NextResponse.json({
      ok: true,
      aliasBackfillRowCount: rowCount(aliasBackfill),
      backfillTeamMembershipsRowCount: rowCount(backfillTeamMemberships),
      entriesAlignRowCount: rowCount(entriesAlign),
      tagsAlignRowCount: rowCount(tagsAlign),
      discussionsStartedAlignRowCount: rowCount(discussionsStartedAlign),
      discussionsResolvedAlignRowCount: rowCount(discussionsResolvedAlign),
      repliesAlignRowCount: rowCount(repliesAlign),
      normalizeActiveStatusRowCount: rowCount(normalizeActiveStatus),
      normalizeActiveStageRowCount: rowCount(normalizeActiveStage),
      summary,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
