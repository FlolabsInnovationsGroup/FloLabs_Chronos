import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getAccessibleUsers } from "@/lib/permissions";
import { getAllActiveTimers } from "@/lib/redis";
import type { ActiveTimer } from "@/types";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await getAccessibleUsers(session.user);
  const activeTimers: Record<string, ActiveTimer> = await getAllActiveTimers().catch(() => ({}));

  const users = rows.map((user) => {
    const activeTimer = activeTimers[user.id];

    return {
      ...user,
      activeTimer: activeTimer
        ? {
            startedAt: activeTimer.startedAt,
            description: activeTimer.description,
            projectId: activeTimer.projectId,
            notionTaskPageId: activeTimer.notionTaskPageId ?? null,
            notionTaskTitle: activeTimer.notionTaskTitle ?? null,
          }
        : null,
    };
  });

  return NextResponse.json({ users });
}

export async function POST() {
  return NextResponse.json(
    { error: "Direct user creation is disabled. Use invitations instead." },
    { status: 405 }
  );
}
