import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getActiveTimer, getAllActiveTimers } from "@/lib/redis";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const all = url.searchParams.get("all");

  if (all === "true" && session.user.role === "admin") {
    const timers = await getAllActiveTimers();
    return NextResponse.json({ timers });
  }

  const timer = await getActiveTimer(session.user.id);
  return NextResponse.json({ timer });
}
