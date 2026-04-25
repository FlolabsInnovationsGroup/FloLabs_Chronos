import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { applicants, timeEntries, projects, tags, users, timeEntryTags } from "@/lib/db/schema";
import { isNull, isNotNull, and, or, eq, lt, inArray } from "drizzle-orm";
import {
  syncEntryToNotionFull,
  markEntryDeleted,
  queryNotionEntriesWindow,
  updateEntryStatus,
} from "@/lib/notion";
import {
  notifyEntryAdded,
  notifyEntryEdited,
  notifyEntryDeleted,
  resolveDiscordWebhookForTeamMember,
} from "@/lib/discord";
import { getNotionConfig } from "@/lib/app-config";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!db) {
    return NextResponse.json({ error: "DB not available" }, { status: 503 });
  }

  const notionConfig = await getNotionConfig();
  if (!notionConfig.notionApiKey || !notionConfig.notionDatabaseId) {
    return NextResponse.json({ error: "Notion not configured" }, { status: 503 });
  }

  let synced = 0;
  let edited = 0;
  let deleted = 0;
  let notified = 0;
  const errors: string[] = [];

  const pendingRows = await db
    .select({
      entry: timeEntries,
      project: projects,
      user: {
        id: users.id,
        name: users.name,
        email: users.email,
        discordWebhookUrl: users.discordWebhookUrl,
        notionTeamMemberId: users.notionTeamMemberId,
      },
      applicant: {
        name: applicants.name,
        email: applicants.email,
        notionTeamMemberId: applicants.notionTeamMemberId,
      },
    })
    .from(timeEntries)
    .leftJoin(projects, eq(timeEntries.projectId, projects.id))
    .leftJoin(users, eq(timeEntries.userId, users.id))
    .leftJoin(
      applicants,
      or(
        eq(timeEntries.applicantId, applicants.id),
        and(isNull(timeEntries.applicantId), eq(applicants.chronosUserId, users.id))
      )
    )
    .where(
      and(
        isNotNull(timeEntries.stoppedAt),
        or(
          isNull(timeEntries.notionPageId),
          lt(timeEntries.syncedAt, timeEntries.updatedAt)
        )
      )
    )
    .limit(50);

  const entryIds = pendingRows.map((r) => r.entry.id);
  const tagRows =
    entryIds.length > 0
      ? await db
          .select({
            timeEntryId: timeEntryTags.timeEntryId,
            tagId: tags.id,
            tagName: tags.name,
          })
          .from(timeEntryTags)
          .innerJoin(tags, eq(timeEntryTags.tagId, tags.id))
          .where(inArray(timeEntryTags.timeEntryId, entryIds))
      : [];

  const tagMap = new Map<string, { id: string; name: string }[]>();
  for (const r of tagRows) {
    const existing = tagMap.get(r.timeEntryId) ?? [];
    existing.push({ id: r.tagId, name: r.tagName });
    tagMap.set(r.timeEntryId, existing);
  }

  for (const row of pendingRows) {
    const isNew = !row.entry.notionPageId;
    const entryTags = tagMap.get(row.entry.id) ?? [];
    const entryFull = {
      ...row.entry,
      project: row.project ?? undefined,
      tags: entryTags,
      user: row.user
        ? {
            ...row.user,
            name: row.applicant?.name ?? row.user.name,
            email: row.applicant?.email ?? row.user.email,
            notionTeamMemberId: row.applicant?.notionTeamMemberId ?? row.user.notionTeamMemberId,
          }
        : undefined,
    };

    try {
      const notionPageId = await syncEntryToNotionFull(
        entryFull as Parameters<typeof syncEntryToNotionFull>[0]
      );

      if (notionPageId) {
        await db
          .update(timeEntries)
          .set({ notionPageId, syncedAt: new Date() })
          .where(eq(timeEntries.id, row.entry.id));
      }

      if (isNew) {
        synced++;
      } else {
        edited++;
      }

      // Same applicant-first merge as `entryFull.user` — Discord must not read `users.notion_team_member_id` alone.
      const notifyUser = entryFull.user;
      const notionTeamMemberId = notifyUser?.notionTeamMemberId?.trim() || null;
      const notifyUserName = notifyUser?.name ?? "Unknown";
      if (notionPageId && notionTeamMemberId) {
        const delivered = isNew
          ? await notifyEntryAdded({
              notionTeamMemberId,
              userName: notifyUserName,
              project: row.project?.name ?? "No project",
              tags: entryTags.map((t) => t.name),
              description: row.entry.description,
              taskTitle: row.entry.notionTaskTitle ?? null,
              durationMs: row.entry.durationMs ?? 0,
              startedAt: new Date(row.entry.startedAt),
              updatedAt: new Date(row.entry.updatedAt ?? row.entry.startedAt),
            })
          : await notifyEntryEdited({
              notionTeamMemberId,
              userName: notifyUserName,
              project: row.project?.name ?? "No project",
              tags: entryTags.map((t) => t.name),
              description: row.entry.description,
              taskTitle: row.entry.notionTaskTitle ?? null,
              durationMs: row.entry.durationMs ?? 0,
              startedAt: new Date(row.entry.startedAt),
              stoppedAt: row.entry.stoppedAt ? new Date(row.entry.stoppedAt) : null,
              updatedAt: new Date(row.entry.updatedAt ?? row.entry.startedAt),
              changes: [],
            });

        if (delivered) {
          notified++;
          await updateEntryStatus(notionPageId, "Notified");
        } else {
          await updateEntryStatus(notionPageId, "Processed");
        }
      } else if (notionPageId) {
        await updateEntryStatus(notionPageId, "Processed");
      }
    } catch (err) {
      errors.push(`Entry ${row.entry.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (notionConfig.notionDatabaseId) {
    try {
      const notionPages = await queryNotionEntriesWindow(360);
      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const notionEntryIds = notionPages
        .map((p) => p.entryId)
        .filter((id): id is string => typeof id === "string" && UUID_RE.test(id));

      if (notionEntryIds.length > 0) {
        const existing = await db
          .select({ id: timeEntries.id })
          .from(timeEntries)
          .where(inArray(timeEntries.id, notionEntryIds));

        const existingSet = new Set(existing.map((r) => r.id));
        const deletedNow = new Date();

        for (const page of notionPages) {
          if (!page.entryId || !UUID_RE.test(page.entryId) || existingSet.has(page.entryId)) continue;

          try {
            await markEntryDeleted(page.notionPageId);
            deleted++;

            const pageRes = await fetch(`https://api.notion.com/v1/pages/${page.notionPageId}`, {
              headers: {
                Authorization: `Bearer ${notionConfig.notionApiKey}`,
                "Content-Type": "application/json",
                "Notion-Version": "2022-06-28",
              },
            });

            if (pageRes.ok) {
              const pageData = (await pageRes.json()) as {
                properties?: Record<string, {
                  type: string;
                  title?: { plain_text: string }[];
                  rich_text?: { plain_text: string }[];
                  multi_select?: { name: string }[];
                  select?: { name: string } | null;
                  number?: number | null;
                  date?: { start?: string | null } | null;
                  relation?: { id: string }[];
                }>;
              };
              const props = pageData.properties ?? {};
              const notionTeamMemberId = props["Team Member"]?.relation?.[0]?.id ?? null;
              if (notionTeamMemberId && await resolveDiscordWebhookForTeamMember(notionTeamMemberId)) {
                const description = props["Description"]?.rich_text?.map((t) => t.plain_text).join("") ?? "";
                const project = props["Project"]?.select?.name ?? "Unknown";
                const tags = props["Tags"]?.multi_select?.map((tag) => tag.name) ?? [];
                const taskTitle = props["Task"]?.relation?.length ? "Task linked in Notion" : "No task linked";
                const durationMs = Math.round((props["Duration"]?.number ?? 0) * 1000);
                const startedAt = new Date(props["Date"]?.date?.start ?? deletedNow.toISOString());
                const userName = props["User Key"]?.title?.map((t) => t.plain_text).join("") ?? "Unknown";

                const delivered = await notifyEntryDeleted({
                  notionTeamMemberId,
                  userName,
                  project,
                  tags,
                  description,
                  taskTitle,
                  durationMs,
                  startedAt,
                  deletedAt: deletedNow,
                });
                if (delivered) {
                  notified++;
                  await updateEntryStatus(page.notionPageId, "Notified");
                }
              }
            }
          } catch (err) {
            errors.push(
              `Delete sync ${page.notionPageId}: ${err instanceof Error ? err.message : String(err)}`
            );
          }

          void deletedNow;
        }
      }
    } catch (err) {
      errors.push(`Delete scan: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return NextResponse.json({
    synced,
    edited,
    deleted,
    notified,
    errors: errors.length > 0 ? errors : undefined,
  });
}
