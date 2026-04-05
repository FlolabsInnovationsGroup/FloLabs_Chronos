import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { projects, timeEntries } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { canManageProjects } from "@/lib/permissions";
import { broadcastDataChange } from "@/lib/realtime";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  color: z.string().optional(),
  icon: z.string().optional(),
  requiresTaskOnStop: z.boolean().optional(),
  archived: z.boolean().optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || !canManageProjects(session.user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!db) return NextResponse.json({ error: "DB not available" }, { status: 503 });

  const { id } = await params;
  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const [project] = await db
    .update(projects)
    .set(parsed.data)
    .where(eq(projects.id, id))
    .returning();

  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  broadcastDataChange("projects");
  return NextResponse.json({ project });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || !canManageProjects(session.user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!db) return NextResponse.json({ error: "DB not available" }, { status: 503 });

  const { id } = await params;

  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.id, id))
    .limit(1);

  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await db.delete(timeEntries).where(eq(timeEntries.projectId, id));
  await db.delete(projects).where(eq(projects.id, id));
  broadcastDataChange("projects");

  return NextResponse.json({ ok: true });
}
