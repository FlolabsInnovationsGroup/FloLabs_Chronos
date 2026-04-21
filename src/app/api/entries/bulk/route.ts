import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { timeEntries, timeEntryTags, projects, tags } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { deleteAndNotifyEntry, syncAndNotifyEntry } from "@/lib/entry-lifecycle";
import { getAccessibleUserIds, isAdmin, isTeamLead } from "@/lib/permissions";
import { chronosUserIdFromSessionUser } from "@/lib/chronos-session";
import { chronosUserDisplayAndNotionTeamMemberId } from "@/lib/chronos-user-notion";

const bulkSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("delete"),
    entryIds: z.array(z.string().uuid()).min(1),
  }),
  z.object({
    action: z.literal("changeProject"),
    entryIds: z.array(z.string().uuid()).min(1),
    projectId: z.string().uuid(),
  }),
]);

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!db) return NextResponse.json({ error: "DB not available" }, { status: 503 });

  const body = await req.json();
  const parsed = bulkSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const { action, entryIds } = parsed.data;
  const userIsAdmin = isAdmin(session.user);
  const userIsTeamLead = isTeamLead(session.user);

  // Fetch entries and verify ownership / team scope
  const found = await db
    .select({ id: timeEntries.id, userId: timeEntries.userId })
    .from(timeEntries)
    .where(inArray(timeEntries.id, entryIds));

  if (found.length !== entryIds.length) {
    return NextResponse.json({ error: "Some entries not found" }, { status: 404 });
  }

  if (!userIsAdmin) {
    if (userIsTeamLead) {
      const accessible = await getAccessibleUserIds(session.user);
      if (accessible === null) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      const forbidden = found.some((e) => !accessible.includes(e.userId));
      if (forbidden) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    } else {
      const chronosUserId = chronosUserIdFromSessionUser(session.user);
      if (!chronosUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      const forbidden = found.some((e) => e.userId !== chronosUserId);
      if (forbidden) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  if (action === "delete") {
    const entries = await db
      .select({
        id: timeEntries.id,
        notionPageId: timeEntries.notionPageId,
        description: timeEntries.description,
        durationMs: timeEntries.durationMs,
        startedAt: timeEntries.startedAt,
        projectId: timeEntries.projectId,
        userId: timeEntries.userId,
      })
      .from(timeEntries)
      .where(inArray(timeEntries.id, entryIds));

    const deletePayloads = [] as Array<{
      notionPageId: string | null;
      notionTeamMemberId: string | null;
      userName: string;
      project: string;
      tags: string[];
      description: string;
      durationMs: number;
      startedAt: Date;
    }>;

    for (const entry of entries) {
      const tagIds = await db.select({ tagId: timeEntryTags.tagId }).from(timeEntryTags).where(eq(timeEntryTags.timeEntryId, entry.id));
      const tagNames = tagIds.length > 0
        ? (await db.select({ name: tags.name }).from(tags).where(inArray(tags.id, tagIds.map((row) => row.tagId)))).map((row) => row.name)
        : [];
      const [projectRow] = entry.projectId
        ? await db.select({ name: projects.name }).from(projects).where(eq(projects.id, entry.projectId)).limit(1)
        : [];
      const profile = await chronosUserDisplayAndNotionTeamMemberId(entry.userId);
      deletePayloads.push({
        notionPageId: entry.notionPageId,
        notionTeamMemberId: profile?.notionTeamMemberId ?? null,
        userName: profile?.name ?? "Unknown",
        project: projectRow?.name ?? "No project",
        tags: tagNames,
        description: entry.description ?? "",
        durationMs: entry.durationMs ?? 0,
        startedAt: new Date(entry.startedAt),
      });
    }

    await db.delete(timeEntries).where(inArray(timeEntries.id, entryIds));

    for (const payload of deletePayloads) {
      await deleteAndNotifyEntry(payload).catch(() => {});
    }

    return NextResponse.json({ success: true, deleted: entryIds.length });
  }

  // action === "changeProject"
  const previousProjects = new Map<string, string>();
  for (const entry of found) {
    const [projectRow] = await db.select({ name: projects.name }).from(projects).innerJoin(timeEntries, eq(projects.id, timeEntries.projectId)).where(eq(timeEntries.id, entry.id)).limit(1);
    previousProjects.set(entry.id, projectRow?.name ?? "No project");
  }

  const [newProject] = await db.select({ name: projects.name }).from(projects).where(eq(projects.id, parsed.data.projectId)).limit(1);

  await db
    .update(timeEntries)
    .set({ projectId: parsed.data.projectId, updatedAt: new Date() })
    .where(inArray(timeEntries.id, entryIds));

  for (const entryId of entryIds) {
    await syncAndNotifyEntry(entryId, [{ field: "project", oldValue: previousProjects.get(entryId) ?? "No project", newValue: newProject?.name ?? "No project" }]).catch(() => {});
  }

  return NextResponse.json({ success: true, updated: entryIds.length });
}
