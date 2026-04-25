/**
 * Fixes historical time entries that are linked to "placeholder" users
 * created by the Notion CSV import (email: *@imported.local) instead of
 * the real canonical users.
 *
 * How the mismatch happened:
 * - The CSV import matched users by notionTeamMemberId, then by name.
 * - When neither matched, it created a placeholder user (email @imported.local)
 *   and linked entries to that placeholder's users.id.
 * - Real users who later registered (or already existed with no Notion ID)
 *   ended up with a different users.id.
 * - The reports page queries time_entries.user_id = chronosUserId, so those
 *   entries are invisible to the real user.
 *
 * Matching strategy (in priority order):
 * 1. placeholder.notion_team_member_id → applicant.notion_team_member_id
 *    → applicant.chronos_user_id = real user  (most reliable)
 * 2. placeholder.notion_team_member_id → users.notion_team_member_id
 *    on a non-imported user  (fallback)
 *
 * Usage:
 *   pnpm exec tsx scripts/backfill-imported-entry-owners.ts          # dry-run
 *   pnpm exec tsx scripts/backfill-imported-entry-owners.ts --live   # apply
 */

import { createPool, createSqlHelpers, loadEnvFiles } from "./db-utils";

loadEnvFiles([".env.local", ".env.production.local"]);

const LIVE = process.argv.includes("--live");

interface FixCandidate {
  placeholder_id: string;
  placeholder_email: string;
  placeholder_name: string;
  notion_team_member_id: string;
  real_user_id: string;
  real_user_email: string;
  real_user_name: string;
  applicant_id: string | null;
  entry_count: number;
  match_via: string;
}

async function main() {
  const pool = createPool();
  const sql = createSqlHelpers(pool);

  try {
    console.log(`Mode: ${LIVE ? "LIVE (changes will be applied)" : "DRY-RUN (no changes)"}`);
    console.log("");

    // --- Strategy 1: match via applicants.notion_team_member_id ---
    const viaApplicant = await sql.query<FixCandidate>(`
      SELECT
        placeholder.id            AS placeholder_id,
        placeholder.email         AS placeholder_email,
        placeholder.name          AS placeholder_name,
        placeholder.notion_team_member_id,
        real_u.id                 AS real_user_id,
        real_u.email              AS real_user_email,
        real_u.name               AS real_user_name,
        a.id                      AS applicant_id,
        COUNT(te.id)::int         AS entry_count,
        'applicant.notion_team_member_id'::text AS match_via
      FROM users placeholder
      JOIN applicants a
        ON a.notion_team_member_id = placeholder.notion_team_member_id
       AND a.chronos_user_id IS NOT NULL
      JOIN users real_u
        ON real_u.id = a.chronos_user_id
      LEFT JOIN time_entries te
        ON te.user_id = placeholder.id
      WHERE placeholder.email LIKE '%@imported.local'
        AND placeholder.notion_team_member_id IS NOT NULL
        AND real_u.id != placeholder.id
      GROUP BY
        placeholder.id, placeholder.email, placeholder.name,
        placeholder.notion_team_member_id,
        real_u.id, real_u.email, real_u.name, a.id
      HAVING COUNT(te.id) > 0
      ORDER BY entry_count DESC
    `);

    // --- Strategy 2: match via users.notion_team_member_id (non-imported user) ---
    const viaRealUser = await sql.query<FixCandidate>(`
      SELECT
        placeholder.id            AS placeholder_id,
        placeholder.email         AS placeholder_email,
        placeholder.name          AS placeholder_name,
        placeholder.notion_team_member_id,
        real_u.id                 AS real_user_id,
        real_u.email              AS real_user_email,
        real_u.name               AS real_user_name,
        a.id                      AS applicant_id,
        COUNT(te.id)::int         AS entry_count,
        'users.notion_team_member_id'::text AS match_via
      FROM users placeholder
      JOIN users real_u
        ON real_u.notion_team_member_id = placeholder.notion_team_member_id
       AND real_u.email NOT LIKE '%@imported.local'
      LEFT JOIN applicants a
        ON a.chronos_user_id = real_u.id
      LEFT JOIN time_entries te
        ON te.user_id = placeholder.id
      WHERE placeholder.email LIKE '%@imported.local'
        AND placeholder.notion_team_member_id IS NOT NULL
      GROUP BY
        placeholder.id, placeholder.email, placeholder.name,
        placeholder.notion_team_member_id,
        real_u.id, real_u.email, real_u.name, a.id
      HAVING COUNT(te.id) > 0
      ORDER BY entry_count DESC
    `);

    // Merge: prefer strategy 1 results; add strategy 2 only for placeholders not already covered.
    const covered = new Set(viaApplicant.map((c) => c.placeholder_id));
    const allCandidates = [
      ...viaApplicant,
      ...viaRealUser.filter((c) => !covered.has(c.placeholder_id)),
    ];

    // Deduplicate by placeholder_id (keep first match per placeholder).
    const seenPlaceholders = new Map<string, number>();
    for (const row of allCandidates) {
      seenPlaceholders.set(
        row.placeholder_id,
        (seenPlaceholders.get(row.placeholder_id) ?? 0) + 1,
      );
    }
    const unambiguous = allCandidates.filter(
      (c) => (seenPlaceholders.get(c.placeholder_id) ?? 0) === 1,
    );
    const ambiguous = allCandidates.filter(
      (c) => (seenPlaceholders.get(c.placeholder_id) ?? 0) > 1,
    );

    // Placeholder users with entries but no match at all.
    const unmatchedPlaceholders = await sql.query<{
      id: string;
      email: string;
      name: string;
      notion_team_member_id: string | null;
      entry_count: number;
    }>(`
      SELECT
        u.id,
        u.email,
        u.name,
        u.notion_team_member_id,
        COUNT(te.id)::int AS entry_count
      FROM users u
      LEFT JOIN time_entries te ON te.user_id = u.id
      WHERE u.email LIKE '%@imported.local'
        AND (
          u.notion_team_member_id IS NULL
          OR (
            NOT EXISTS (
              SELECT 1 FROM applicants a
              WHERE a.notion_team_member_id = u.notion_team_member_id
                AND a.chronos_user_id IS NOT NULL
            )
            AND NOT EXISTS (
              SELECT 1 FROM users real_u
              WHERE real_u.notion_team_member_id = u.notion_team_member_id
                AND real_u.email NOT LIKE '%@imported.local'
            )
          )
        )
      GROUP BY u.id, u.email, u.name, u.notion_team_member_id
      HAVING COUNT(te.id) > 0
      ORDER BY entry_count DESC
    `);

    // --- Report ---
    console.log("=== Placeholder users that CAN be fixed (unambiguous match) ===");
    if (unambiguous.length === 0) {
      console.log("  None found.");
    } else {
      for (const c of unambiguous) {
        const applicantNote = c.applicant_id
          ? `applicant=${c.applicant_id.slice(0, 8)}`
          : "no applicant";
        console.log(
          `  ${c.entry_count} entries  [${c.match_via}]  "${c.placeholder_name}" (${c.placeholder_email}) → "${c.real_user_name}" (${c.real_user_email}) [${applicantNote}]`,
        );
      }
    }

    if (ambiguous.length > 0) {
      console.log(
        "\n=== AMBIGUOUS — placeholder maps to multiple real users (skipped) ===",
      );
      for (const c of ambiguous) {
        console.log(
          `  Placeholder: ${c.placeholder_email} (notionId=${c.notion_team_member_id})`,
        );
      }
    }

    if (unmatchedPlaceholders.length > 0) {
      console.log(
        "\n=== Placeholder users with entries but NO match (manual review needed) ===",
      );
      for (const u of unmatchedPlaceholders) {
        console.log(
          `  ${u.entry_count} entries: "${u.name}" (${u.email}, notionId=${u.notion_team_member_id ?? "null"})`,
        );
      }
    }

    const totalFixable = unambiguous.reduce((s, c) => s + c.entry_count, 0);
    const totalUnmatched = unmatchedPlaceholders.reduce((s, u) => s + u.entry_count, 0);

    console.log(`\nSummary:`);
    console.log(
      `  Fixable:   ${unambiguous.length} placeholder(s) → ${totalFixable} entries`,
    );
    console.log(`  Ambiguous: ${ambiguous.length} placeholder(s) skipped`);
    console.log(
      `  Unmatched: ${unmatchedPlaceholders.length} placeholder(s) with ${totalUnmatched} entries needing manual review`,
    );

    if (!LIVE) {
      console.log("\n  Run with --live to apply the fixes.");
      return;
    }

    if (unambiguous.length === 0) {
      console.log("\nNothing to fix. Done.");
      return;
    }

    // --- Apply fixes in a transaction ---
    console.log("\nApplying fixes...");
    await pool.query("BEGIN");
    try {
      let totalUpdated = 0;
      for (const c of unambiguous) {
        const result = await pool.query(
          `
          UPDATE time_entries
          SET
            user_id    = $1,
            flolabs_id = COALESCE($2, flolabs_id)
          WHERE user_id = $3
          `,
          [c.real_user_id, c.applicant_id ?? null, c.placeholder_id],
        );
        const updated = result.rowCount ?? 0;
        totalUpdated += updated;
        console.log(
          `  Updated ${updated} entries: "${c.placeholder_name}" → "${c.real_user_name}"`,
        );
      }
      await pool.query("COMMIT");
      console.log(`\nDone. Total entries updated: ${totalUpdated}`);
    } catch (err) {
      await pool.query("ROLLBACK");
      console.error("Transaction rolled back:", err);
      throw err;
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
