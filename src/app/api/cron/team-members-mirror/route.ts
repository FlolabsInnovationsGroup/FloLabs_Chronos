import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { applicants, teams, users, teamMemberships } from "@/lib/db/schema";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { pushTeamMemberProfileToNotion } from "@/lib/notion";
import { getNotionConfig } from "@/lib/app-config";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Max users processed per invocation. Rotate with ?offset=N for larger teams. */
const DEFAULT_LIMIT = 50;

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!db) return NextResponse.json({ error: "DB not available" }, { status: 503 });

  const url = new URL(req.url);
  const limit = Math.min(Math.max(1, parseInt(url.searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT), 200);
  const offset = Math.max(0, parseInt(url.searchParams.get("offset") ?? "0", 10) || 0);

  // Fetch active users with a linked Notion Team Member page (paginated)
  const linkedUsers = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      weeklyTargetHours: users.weeklyTargetHours,
      notionTeamMemberId: users.notionTeamMemberId,
    })
    .from(users)
    .where(and(eq(users.isActive, true), isNotNull(users.notionTeamMemberId)))
    .limit(limit)
    .offset(offset);

  if (linkedUsers.length === 0) {
    return NextResponse.json({ synced: 0, errors: [] });
  }

  // Resolve Notion config once — avoids N DB queries inside the per-user loop.
  const { notionApiKey, notionTeamMembersDbId } = await getNotionConfig();
  if (!notionApiKey || !notionTeamMembersDbId) {
    return NextResponse.json({ error: "Notion not configured" }, { status: 503 });
  }
  const resolvedConfig = { notionApiKey, notionTeamMembersDbId };

  const userIds = linkedUsers.map((u) => u.id);

  // Fetch applicant overrides for display name / email / notionTeamMemberId
  const applicantRows = await db
    .select({
      chronosUserId: applicants.chronosUserId,
      name: applicants.name,
      email: applicants.email,
      notionTeamMemberId: applicants.notionTeamMemberId,
    })
    .from(applicants)
    .where(inArray(applicants.chronosUserId, userIds));

  const applicantMap = new Map(
    applicantRows
      .filter((r): r is typeof r & { chronosUserId: string } => !!r.chronosUserId)
      .map((r) => [r.chronosUserId, r])
  );

  // Fetch team memberships → Notion page IDs
  const membershipRows = await db
    .select({
      userId: teamMemberships.userId,
      notionPageId: teams.notionPageId,
    })
    .from(teamMemberships)
    .innerJoin(teams, eq(teamMemberships.teamId, teams.id))
    .where(inArray(teamMemberships.userId, userIds));

  const teamPageIdsMap = new Map<string, string[]>();
  for (const row of membershipRows) {
    if (!row.notionPageId) continue;
    const existing = teamPageIdsMap.get(row.userId) ?? [];
    existing.push(row.notionPageId);
    teamPageIdsMap.set(row.userId, existing);
  }

  let synced = 0;
  const errors: string[] = [];

  // Process in parallel batches of 5 to stay within Notion's rate limit.
  const BATCH_SIZE = 5;
  for (let i = 0; i < linkedUsers.length; i += BATCH_SIZE) {
    const batch = linkedUsers.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async (user) => {
        const applicant = applicantMap.get(user.id);
        const notionTeamMemberId =
          applicant?.notionTeamMemberId?.trim() || user.notionTeamMemberId?.trim() || null;
        if (!notionTeamMemberId) return;

        const finalName = applicant?.name?.trim() || user.name;
        const finalEmail = applicant?.email?.trim() || user.email;
        const notionTeamPageIds = teamPageIdsMap.get(user.id) ?? [];

        try {
          await pushTeamMemberProfileToNotion({
            notionTeamMemberPageId: notionTeamMemberId,
            name: finalName,
            email: finalEmail,
            role: user.role as "admin" | "team_lead" | "member" | "hr",
            weeklyTargetHours: user.weeklyTargetHours ?? 40,
            notionTeamPageIds,
            _resolvedConfig: resolvedConfig,
          });
          synced++;
        } catch (err) {
          errors.push(`${user.id}: ${err instanceof Error ? err.message : String(err)}`);
        }
      })
    );
  }

  return NextResponse.json({ synced, errors: errors.length > 0 ? errors : undefined });
}
