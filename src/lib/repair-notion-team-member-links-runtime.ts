import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import {
  effectiveNotionTeamMemberId,
  notionTeamMemberPageUrlFromId,
  resolveNotionTeamMemberLink,
} from "@/lib/notion-team-member-link";
import { eq, or, sql as dsql } from "drizzle-orm";

let _repairPromise: Promise<void> | null = null;

/** One-shot per process: normalize shared flolabs_users Notion link columns. */
export function ensureNotionTeamMemberLinksRepaired(): Promise<void> {
  if (!db) return Promise.resolve();
  if (!_repairPromise) {
    _repairPromise = runRepair().catch((err) => {
      _repairPromise = null;
      console.error("[repair-notion-team-member-links] failed", err);
      throw err;
    });
  }
  return _repairPromise;
}

async function runRepair() {
  if (!db) return;
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      notionTeamMemberId: users.notionTeamMemberId,
      notionTeamMemberPageUrl: users.notionTeamMemberPageUrl,
    })
    .from(users)
    .where(
      or(
        dsql`coalesce(nullif(trim(${users.notionTeamMemberPageUrl}), ''), '') <> ''`,
        dsql`coalesce(nullif(trim(${users.notionTeamMemberId}), ''), '') <> ''`
      )
    );

  for (const row of rows) {
    const resolved = resolveNotionTeamMemberLink({
      notionTeamMemberId: row.notionTeamMemberId,
      notionTeamMemberPageUrl: row.notionTeamMemberPageUrl,
    });
    const effective = effectiveNotionTeamMemberId({
      notionTeamMemberId: row.notionTeamMemberId,
      notionTeamMemberPageUrl: row.notionTeamMemberPageUrl,
    });
    if (!effective) continue;

    const pageUrl = resolved.pageUrl ?? notionTeamMemberPageUrlFromId(effective);
    const idNorm = effective.replace(/-/g, "").toLowerCase();
    const storedNorm = (row.notionTeamMemberId ?? "").replace(/-/g, "").toLowerCase();
    const urlMatches = (row.notionTeamMemberPageUrl ?? "").trim() === pageUrl;
    if (storedNorm === idNorm && urlMatches) continue;

    await db
      .update(users)
      .set({
        notionTeamMemberId: effective,
        notionTeamMemberPageUrl: pageUrl,
        updatedAt: new Date(),
      })
      .where(eq(users.id, row.id));
  }
}
