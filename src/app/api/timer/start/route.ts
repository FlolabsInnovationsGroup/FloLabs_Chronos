import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { setActiveTimer, broadcastTimerEvent } from "@/lib/redis";
import { db } from "@/lib/db";
import { timeEntries, users, projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { sendDiscordEmbed, buildTimerStartEmbed } from "@/lib/discord";

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

  // Fire Discord notification fire-and-forget
  (async () => {
    if (!db) return;
    const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (user[0]?.discordWebhookUrl && user[0]?.notifyOnStart) {
      const project = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
      await sendDiscordEmbed(
        user[0].discordWebhookUrl,
        buildTimerStartEmbed(user[0].name, project[0]?.name ?? "Unknown", description)
      );
    }
  })().catch(() => {});

  return NextResponse.json({ ok: true, timer });
}
