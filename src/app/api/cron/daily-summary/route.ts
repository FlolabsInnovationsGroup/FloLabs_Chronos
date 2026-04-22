import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { applicants, timeEntries, projects, tags, users, timeEntryTags } from "@/lib/db/schema";
import { eq, and, gte, isNotNull, inArray } from "drizzle-orm";
import { sendDiscordEmbed, buildDailySummaryEmbed } from "@/lib/discord";
import { whereTimeEntriesForLinkedUser } from "@/lib/time-entry-applicant";
import { chronosEntryOwnerDisplayMap } from "@/lib/chronos-user-notion";
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
      const [linkedApplicant] = await db
        .select({ id: applicants.id, name: applicants.name, email: applicants.email })
        .from(applicants)
        .where(eq(applicants.chronosUserId, user.id))
        .limit(1);

      const rows = await db
        .select({
          entry: timeEntries,
          project: projects,
          user: { id: users.id, name: users.name, email: users.email },
        })
        .from(timeEntries)
        .leftJoin(projects, eq(timeEntries.projectId, projects.id))
        .leftJoin(users, eq(timeEntries.userId, users.id))
        .where(
          and(
            whereTimeEntriesForLinkedUser(user.id, linkedApplicant?.id ?? null),
            isNotNull(timeEntries.stoppedAt),
            gte(timeEntries.startedAt, today)
          )
        );

      // Fetch tags for these entries
      const entryIds = rows.map((r) => r.entry.id);
      const [tagRows, ownerDisplayMap] = await Promise.all([
        entryIds.length > 0
          ? db
              .select({ timeEntryId: timeEntryTags.timeEntryId, tagId: tags.id, tagName: tags.name })
              .from(timeEntryTags)
              .innerJoin(tags, eq(timeEntryTags.tagId, tags.id))
              .where(inArray(timeEntryTags.timeEntryId, entryIds))
          : Promise.resolve([]),
        chronosEntryOwnerDisplayMap(rows.map((r) => ({ userId: r.entry.userId, applicantId: r.entry.applicantId ?? null }))),
      ]);

      const tagMap = new Map<string, { id: string; name: string }[]>();
      for (const r of tagRows) {
        const existing = tagMap.get(r.timeEntryId) ?? [];
        existing.push({ id: r.tagId, name: r.tagName });
        tagMap.set(r.timeEntryId, existing);
      }

      const userEntries = rows.map(({ entry, project, user: entryUser }) => ({
        ...entry,
        project: project ?? undefined,
        tags: tagMap.get(entry.id) ?? [],
        user: ownerDisplayMap.get(`${entry.userId}:${entry.applicantId ?? ""}`) ?? entryUser ?? { id: user.id, name: user.name, email: user.email },
      })) as TimeEntry[];

      const summaryName = linkedApplicant?.name?.trim() || user.name;
      const embed = buildDailySummaryEmbed(summaryName, userEntries);
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
