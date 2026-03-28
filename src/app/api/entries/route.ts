import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { timeEntries, projects, tags, users } from "@/lib/db/schema";
import { eq, and, gte, lte, desc, inArray, isNotNull, type SQL } from "drizzle-orm";
import { z } from "zod";
import { getAccessibleUserIds } from "@/lib/permissions";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!db) return NextResponse.json({ entries: [] });

  const url = new URL(req.url);
  const limit = parseInt(url.searchParams.get("limit") ?? "50");
  const requestedUserId = url.searchParams.get("userId");
  const accessibleUserIds = await getAccessibleUserIds(session.user);

  const conditions: SQL[] = [
    isNotNull(timeEntries.stoppedAt),
  ];

  if (accessibleUserIds !== null) {
    if (requestedUserId && !accessibleUserIds.includes(requestedUserId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (requestedUserId) {
      conditions.push(eq(timeEntries.userId, requestedUserId));
    } else if (accessibleUserIds.length === 1) {
      conditions.push(eq(timeEntries.userId, accessibleUserIds[0]));
    } else {
      conditions.push(inArray(timeEntries.userId, accessibleUserIds));
    }
  } else if (requestedUserId) {
    conditions.push(eq(timeEntries.userId, requestedUserId));
  }

  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (from) conditions.push(gte(timeEntries.startedAt, new Date(from)));
  if (to) conditions.push(lte(timeEntries.startedAt, new Date(to)));

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
    .where(and(...conditions))
    .orderBy(desc(timeEntries.startedAt))
    .limit(limit);

  const entries = rows.map(({ entry, project, tag, user }) => ({
    ...entry,
    project,
    tag,
    user,
  }));

  return NextResponse.json({ entries });
}

const createSchema = z.object({
  projectId: z.string().uuid(),
  tagId: z.string().uuid().optional().nullable(),
  description: z.string(),
  startedAt: z.string(),
  stoppedAt: z.string(),
  durationMs: z.number(),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!db) return NextResponse.json({ error: "DB not available" }, { status: 503 });

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const [entry] = await db.insert(timeEntries).values({
    userId: session.user.id,
    ...parsed.data,
    startedAt: new Date(parsed.data.startedAt),
    stoppedAt: new Date(parsed.data.stoppedAt),
    tagId: parsed.data.tagId ?? null,
  }).returning();

  return NextResponse.json({ entry }, { status: 201 });
}
