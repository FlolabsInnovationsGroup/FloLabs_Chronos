import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { projects, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { canManageProjects } from "@/lib/permissions";
import { broadcastDataChange } from "@/lib/realtime";
import { chronosUserIdFromSessionUser } from "@/lib/chronos-session";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!db) return NextResponse.json({ projects: [] });

  const rows = await db
    .select({
      project: projects,
      creatorId: users.id,
      creatorName: users.name,
    })
    .from(projects)
    .leftJoin(users, eq(projects.createdById, users.id))
    .orderBy(projects.name);

  return NextResponse.json({
    projects: rows.map(({ project, creatorId, creatorName }) => ({
      ...project,
      createdBy:
        creatorId != null ? { id: creatorId, name: creatorName ?? "Unknown" } : null,
    })),
  });
}

const createSchema = z.object({
  name: z.string().min(1),
  color: z.string().default("#366769"),
  icon: z.string().default("folder"),
  requiresTaskOnStop: z.boolean().default(false),
});

/** Legacy PUT ?id= — only allow safe fields (never createdById). */
const putUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  color: z.string().optional(),
  icon: z.string().optional(),
  requiresTaskOnStop: z.boolean().optional(),
  archived: z.boolean().optional(),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user || !canManageProjects(session.user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!db) return NextResponse.json({ error: "DB not available" }, { status: 503 });

  const chronosUserId = chronosUserIdFromSessionUser(session.user);
  if (!chronosUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid" }, { status: 400 });

  const [project] = await db
    .insert(projects)
    .values({ ...parsed.data, createdById: chronosUserId })
    .returning();
  broadcastDataChange("projects");
  return NextResponse.json({ project }, { status: 201 });
}

export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user || !canManageProjects(session.user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!db) return NextResponse.json({ error: "DB not available" }, { status: 503 });

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const body = await req.json();
  const parsed = putUpdateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid" }, { status: 400 });
  const [project] = await db
    .update(projects)
    .set(parsed.data)
    .where(eq(projects.id, id))
    .returning();
  broadcastDataChange("projects");
  return NextResponse.json({ project });
}

export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user || !canManageProjects(session.user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!db) return NextResponse.json({ error: "DB not available" }, { status: 503 });

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  await db.update(projects).set({ archived: true }).where(eq(projects.id, id));
  broadcastDataChange("projects");
  return NextResponse.json({ ok: true });
}
