import { NextResponse } from "next/server";
import { warmTeamMemberDirectoryCache } from "@/lib/notion";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim();
  if (!token || token !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { entryCount } = await warmTeamMemberDirectoryCache();
    return NextResponse.json({ ok: true, entryCount });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Warm-up failed" },
      { status: 500 },
    );
  }
}
