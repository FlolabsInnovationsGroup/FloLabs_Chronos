/**
 * Backfill `notion_team_member_id` from `notion_team_member_page_url` (and normalize id format)
 * on shared `flolabs_users` rows. Safe to run multiple times.
 *
 * Usage: DATABASE_URL=... npx tsx scripts/repair-notion-team-member-links.ts
 */
import pg from "pg";
import {
  effectiveNotionTeamMemberId,
  notionTeamMemberPageUrlFromId,
  resolveNotionTeamMemberLink,
} from "../src/lib/notion-team-member-link";

async function main() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();

  const { rows } = await client.query<{
    id: string;
    email: string;
    notion_team_member_id: string | null;
    notion_team_member_page_url: string | null;
  }>(
    `select id, email, notion_team_member_id, notion_team_member_page_url
     from flolabs_users
     where coalesce(nullif(trim(notion_team_member_page_url), ''), '') <> ''
        or coalesce(nullif(trim(notion_team_member_id), ''), '') <> ''`
  );

  let updated = 0;
  for (const row of rows) {
    const resolved = resolveNotionTeamMemberLink({
      notionTeamMemberId: row.notion_team_member_id,
      notionTeamMemberPageUrl: row.notion_team_member_page_url,
    });
    const effective = effectiveNotionTeamMemberId({
      notionTeamMemberId: row.notion_team_member_id,
      notionTeamMemberPageUrl: row.notion_team_member_page_url,
    });
    if (!effective) continue;

    const pageUrl = resolved.pageUrl ?? notionTeamMemberPageUrlFromId(effective);
    const idNorm = effective.replace(/-/g, "").toLowerCase();
    const storedNorm = (row.notion_team_member_id ?? "").replace(/-/g, "").toLowerCase();
    const urlMatches = (row.notion_team_member_page_url ?? "").trim() === pageUrl;

    if (storedNorm === idNorm && urlMatches) continue;

    await client.query(
      `update flolabs_users
       set notion_team_member_id = $1,
           notion_team_member_page_url = $2,
           updated_at = now()
       where id = $3`,
      [effective, pageUrl, row.id]
    );
    updated += 1;
    console.log(`repaired ${row.email} -> ${effective}`);
  }

  await client.end();
  console.log(`Done. Updated ${updated} of ${rows.length} candidate rows.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
