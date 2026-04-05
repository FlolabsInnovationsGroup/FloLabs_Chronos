import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { searchTeamMemberPages } from "@/lib/notion";
import { canManageTeams } from "@/lib/permissions";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user || !canManageTeams(session.user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? "";
  const limitRaw = url.searchParams.get("limit");
  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 40;

  try {
    const pages = await searchTeamMemberPages(q, Number.isFinite(limit) ? limit : 40);
    return NextResponse.json({ pages });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Team Member search failed." },
      { status: 500 }
    );
  }
}
