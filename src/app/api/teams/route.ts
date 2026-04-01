import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getAccessibleTeams } from "@/lib/permissions";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await getAccessibleTeams(session.user);
  return NextResponse.json({ teams: rows });
}

/**
 * Team creation is disabled. Teams are managed exclusively in Notion
 * and imported automatically via the /api/cron/teams-sync cron job.
 * No role — including admin — may create teams directly in Chronos.
 */
export async function POST() {
  return NextResponse.json(
    { error: "Team creation is disabled. Teams are managed in Notion and synced automatically." },
    { status: 405 }
  );
}
