import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { timeEntries, projects, tags, users } from "@/lib/db/schema";
import { eq, and, gte, lte, desc, isNotNull } from "drizzle-orm";
import { z } from "zod";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!db) return NextResponse.json({ entries: [] });

  const url = new URL(req.url);
  const limit = parseInt(url.searchParams.get("limit") ?? "50");
  const userId = session.user.role === "admin"
    ? (url.searchParams.get("userId") ?? session.user.id)
    : session.user.id;

  const conditions = [
    eq(timeEntries.userId, userId),
    isNotNull(timeEntries.stoppedAt),
  ];

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
