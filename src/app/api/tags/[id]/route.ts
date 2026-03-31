import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { tags } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { broadcastDataChange } from "@/lib/realtime";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!db) return NextResponse.json({ error: "DB not available" }, { status: 503 });

  const { id } = await params;

  const [existing] = await db.select().from(tags).where(eq(tags.id, id)).limit(1);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isAdmin = session.user.role === "admin";
  if (!isAdmin && existing.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = z.object({ name: z.string().min(1).max(50) }).safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid" }, { status: 400 });

  const newName = parsed.data.name.trim();
  const ownerId = existing.userId;

  const conflict = await db
    .select({ id: tags.id })
    .from(tags)
    .where(and(eq(tags.name, newName), eq(tags.userId, ownerId)))
    .limit(1);

  if (conflict.length > 0 && conflict[0].id !== id) {
    return NextResponse.json({ error: "A tag with this name already exists" }, { status: 409 });
  }

  const [tag] = await db
    .update(tags)
    .set({ name: newName })
    .where(eq(tags.id, id))
    .returning();

  broadcastDataChange("tags");
  return NextResponse.json({ tag });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!db) return NextResponse.json({ error: "DB not available" }, { status: 503 });

  const { id } = await params;

  const [existing] = await db.select().from(tags).where(eq(tags.id, id)).limit(1);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isAdmin = session.user.role === "admin";
  if (!isAdmin && existing.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await db.delete(tags).where(eq(tags.id, id));
  broadcastDataChange("tags");
  return NextResponse.json({ ok: true });
}
