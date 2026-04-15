import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { markUserWebsiteVisit } from "@/lib/user-activity";

export const dynamic = "force-dynamic";

export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await markUserWebsiteVisit(session.user.id, session.user.email);
  return NextResponse.json(
    { ok: true },
    {
      headers: { "Cache-Control": "no-store, max-age=0" },
    },
  );
}
