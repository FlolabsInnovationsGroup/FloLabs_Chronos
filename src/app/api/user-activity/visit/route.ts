import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { markUserWebsiteVisit } from "@/lib/user-activity";
import { chronosUserIdFromSessionUser } from "@/lib/chronos-session";

export const dynamic = "force-dynamic";

export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const chronosUserId = chronosUserIdFromSessionUser(session.user);
  if (!chronosUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await markUserWebsiteVisit(chronosUserId, session.user.email);
  return NextResponse.json(
    { ok: true },
    {
      headers: { "Cache-Control": "no-store, max-age=0" },
    },
  );
}
