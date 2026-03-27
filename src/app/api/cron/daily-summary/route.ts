import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { timeEntries, projects, tags, users } from "@/lib/db/schema";
import { eq, and, gte, isNotNull } from "drizzle-orm";
import { sendDiscordEmbed, buildDailySummaryEmbed } from "@/lib/discord";
import type { TimeEntry } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: Request) {
  // Validate cron secret
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!db) {
    return NextResponse.json({ error: "DB not available" }, { status: 503 });
  }

  // Find users who want a daily summary and have a webhook configured
  const eligibleUsers = await db
    .select()
    .from(users)
    .where(
      and(
        eq(users.dailySummary, true),
        isNotNull(users.discordWebhookUrl)
      )
    );

  if (eligibleUsers.length === 0) {
    return NextResponse.json({ sent: 0 });
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let sent = 0;
  const errors: string[] = [];

  for (const user of eligibleUsers) {
    if (!user.discordWebhookUrl) continue;

    try {
      // Fetch today's completed entries for this user
      const rows = await db
        .select({
          entry: timeEntries,
          project: projects,
          tag: tags,
          user: { id: users.id, name: users.name, email: users.email },
        })
        .from(timeEntries)
        .leftJoin(projects, eq(timeEntries.projectId, projects.id))
        .leftJoin(tags, eq(timeEntries.tagId, tags.id))
        .leftJoin(users, eq(timeEntries.userId, users.id))
        .where(
          and(
            eq(timeEntries.userId, user.id),
            isNotNull(timeEntries.stoppedAt),
            gte(timeEntries.startedAt, today)
          )
        );

      const userEntries = rows.map(({ entry, project, tag }) => ({
        ...entry,
        project: project ?? undefined,
        tag: tag ?? null,
        user: user ? { id: user.id, name: user.name, email: user.email } : undefined,
      })) as TimeEntry[];

      const embed = buildDailySummaryEmbed(user.name, userEntries);
      await sendDiscordEmbed(user.discordWebhookUrl, embed);
      sent++;
    } catch (err) {
      errors.push(`User ${user.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return NextResponse.json({
    sent,
    errors: errors.length > 0 ? errors : undefined,
  });
}
