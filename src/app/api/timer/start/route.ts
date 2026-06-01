import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { setActiveTimer, broadcastTimerEvent } from "@/lib/redis";
import { db } from "@/lib/db";
import { timeEntries, users, projects, tags } from "@/lib/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { whereTagsForLinkedUser } from "@/lib/tag-applicant";
import { z } from "zod";
import { sendDiscordEmbed, buildTimerStartEmbed } from "@/lib/discord";
import { applicantIdForSessionLinkedUser, chronosUserIdFromSessionUser } from "@/lib/chronos-session";

const startSchema = z.object({
  projectId: z.string().uuid().optional().nullable(),
  tagIds: z.array(z.string().uuid()).optional().default([]),
  description: z.string().default(""),
  notionTaskPageId: z.string().optional().nullable(),
  notionTaskTitle: z.string().optional().nullable(),
});

export async function POST(req: Request) {
  try {
    return await handleTimerStart(req);
  } catch (error) {
    console.error("[timer/start] unhandled error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to start timer" },
      { status: 500 }
    );
  }
}

async function handleTimerStart(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const chronosUserId = chronosUserIdFromSessionUser(session.user);
  if (!chronosUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = startSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const { projectId, tagIds, description, notionTaskPageId, notionTaskTitle } = parsed.data;
  const userId = chronosUserId;
  const startedAt = Date.now();

  let selectedProject: { id: string; requiresTaskOnStop: boolean; name: string } | null = null;
  if (db && projectId) {
    const [project] = await db
      .select({ id: projects.id, requiresTaskOnStop: projects.requiresTaskOnStop, name: projects.name })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 400 });
    }

    selectedProject = project;
  }

  const uniqueTagIds = [...new Set(tagIds)];
  if (db && uniqueTagIds.length > 0) {
    const applicantId = applicantIdForSessionLinkedUser(session.user);
    const ownedTags = await db
      .select({ id: tags.id })
      .from(tags)
      .where(and(whereTagsForLinkedUser(userId, applicantId), inArray(tags.id, uniqueTagIds)));

    if (ownedTags.length !== uniqueTagIds.length) {
      return NextResponse.json({ error: "One or more tags are invalid" }, { status: 400 });
    }
  }

  const timer = {
    userId,
    projectId: projectId ?? null,
    projectName: selectedProject?.name ?? null,
    projectRequiresTaskOnStop: selectedProject?.requiresTaskOnStop ?? false,
    tagIds: uniqueTagIds,
    description,
    notionTaskPageId: notionTaskPageId ?? null,
    notionTaskTitle: notionTaskTitle ?? null,
    startedAt,
  };

  await setActiveTimer(userId, timer);

  // Write a running entry to DB for crash recovery (no tagIds on the entry row; set on stop)
  if (db) {
    const applicantId = applicantIdForSessionLinkedUser(session.user);
    await db.insert(timeEntries).values({
      userId,
      ...(applicantId ? { applicantId } : {}),
      projectId: projectId ?? null,
      description,
      notionTaskPageId: notionTaskPageId ?? null,
      notionTaskTitle: notionTaskTitle ?? null,
      startedAt: new Date(startedAt),
    });
  }

  await broadcastTimerEvent({ type: "timer:start", userId, data: timer });

  // Fire Discord notification fire-and-forget
  (async () => {
    if (!db) return;
    const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (user[0]?.discordWebhookUrl && user[0]?.notifyOnStart) {
      const project = projectId
        ? await db.select().from(projects).where(eq(projects.id, projectId)).limit(1)
        : [];
      await sendDiscordEmbed(
        user[0].discordWebhookUrl,
        buildTimerStartEmbed(user[0].name, project[0]?.name ?? "No project", description)
      );
    }
  })().catch(() => {});

  return NextResponse.json({ ok: true, timer });
}
