import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { setActiveTimer, broadcastTimerEvent } from "@/lib/redis";
import { db } from "@/lib/db";
import { timeEntries } from "@/lib/db/schema";
import { z } from "zod";

const startSchema = z.object({
  projectId: z.string().uuid(),
  tagId: z.string().uuid().optional().nullable(),
  description: z.string().default(""),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = startSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const { projectId, tagId, description } = parsed.data;
  const userId = session.user.id;
  const startedAt = Date.now();

  const timer = { userId, projectId, tagId: tagId ?? null, description, startedAt };

  await setActiveTimer(userId, timer);

  // Write a running entry to DB for crash recovery
  if (db) {
    await db.insert(timeEntries).values({
      userId,
      projectId,
      tagId: tagId ?? null,
      description,
      startedAt: new Date(startedAt),
    });
  }

  broadcastTimerEvent({ type: "timer:start", userId, data: timer });

  return NextResponse.json({ ok: true, timer });
}
