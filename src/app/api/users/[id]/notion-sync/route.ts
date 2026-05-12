import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { applicants, teams, users } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { getUserTeams } from "@/lib/permissions";
import { pushTeamMemberProfileToNotion } from "@/lib/notion";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const role = session.user.role;
  if (role !== "admin" && role !== "hr") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!db) return NextResponse.json({ error: "DB not available" }, { status: 503 });

  const { id } = await params;

  const [userRow] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      weeklyTargetHours: users.weeklyTargetHours,
      notionTeamMemberId: users.notionTeamMemberId,
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);

  if (!userRow) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [applicantRow] = await db
    .select({
      name: applicants.name,
      email: applicants.email,
      notionTeamMemberId: applicants.notionTeamMemberId,
    })
    .from(applicants)
    .where(eq(applicants.chronosUserId, id))
    .limit(1);

  const notionTeamMemberId =
    applicantRow?.notionTeamMemberId?.trim() || userRow.notionTeamMemberId?.trim() || null;

  if (!notionTeamMemberId) {
    return NextResponse.json({ error: "This user has no linked Notion Team Member page." }, { status: 400 });
  }

  const userTeams = await getUserTeams(id);
  const teamIds = userTeams.map((t) => t.id);

  const teamRows =
    teamIds.length > 0
      ? await db
          .select({ notionPageId: teams.notionPageId })
          .from(teams)
          .where(inArray(teams.id, teamIds))
      : [];
  const notionTeamPageIds = teamRows
    .map((row) => row.notionPageId)
    .filter((v): v is string => Boolean(v));

  const finalName = applicantRow?.name?.trim() || userRow.name;
  const finalEmail = applicantRow?.email?.trim() || userRow.email;

  await pushTeamMemberProfileToNotion({
    notionTeamMemberPageId: notionTeamMemberId,
    name: finalName,
    email: finalEmail,
    role: userRow.role as "admin" | "team_lead" | "member" | "hr",
    weeklyTargetHours: userRow.weeklyTargetHours ?? 40,
    notionTeamPageIds,
  });

  return NextResponse.json({ ok: true });
}
