import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { tags, users } from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { z } from "zod";
import { broadcastDataChange } from "@/lib/realtime";
import { chronosUserIdFromSessionUser } from "@/lib/chronos-session";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!db) return NextResponse.json({ tags: [] });

  const isAdmin = session.user.role === "admin" || session.user.role === "hr";

  if (isAdmin) {
    const rows = await db
      .select({
        id: tags.id,
        name: tags.name,
        userId: tags.userId,
        createdAt: tags.createdAt,
        user: { id: users.id, name: users.name },
      })
      .from(tags)
      .leftJoin(users, eq(tags.userId, users.id))
      .orderBy(tags.name);
    return NextResponse.json({ tags: rows });
  }

  const chronosUserId = chronosUserIdFromSessionUser(session.user);
  if (!chronosUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await db
    .select()
    .from(tags)
    .where(eq(tags.userId, chronosUserId))
    .orderBy(tags.name);
  return NextResponse.json({ tags: rows });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!db) return NextResponse.json({ error: "DB not available" }, { status: 503 });

  const chronosUserId = chronosUserIdFromSessionUser(session.user);
  if (!chronosUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = z.object({ name: z.string().min(1).max(50) }).safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid" }, { status: 400 });

  const existing = await db
    .select({ id: tags.id })
    .from(tags)
    .where(and(eq(tags.name, parsed.data.name.trim()), eq(tags.userId, chronosUserId)))
    .limit(1);

  if (existing.length > 0) {
    return NextResponse.json({ error: "You already have a tag with this name" }, { status: 409 });
  }

  const [tag] = await db
    .insert(tags)
    .values({ name: parsed.data.name.trim(), userId: chronosUserId })
    .returning();

  broadcastDataChange("tags");
  return NextResponse.json({ tag }, { status: 201 });
}

export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!db) return NextResponse.json({ error: "DB not available" }, { status: 503 });

  const chronosUserId = chronosUserIdFromSessionUser(session.user);
  if (!chronosUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const singleId = url.searchParams.get("id");
  const multiIds = url.searchParams.get("ids");

  const ids: string[] = singleId
    ? [singleId]
    : multiIds
    ? multiIds.split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  if (ids.length === 0) return NextResponse.json({ error: "Missing id(s)" }, { status: 400 });

  const isAdmin = session.user.role === "admin" || session.user.role === "hr";

  if (!isAdmin) {
    const found = await db
      .select({ id: tags.id, userId: tags.userId })
      .from(tags)
      .where(inArray(tags.id, ids));
    const forbidden = found.some((t) => t.userId !== chronosUserId);
    if (forbidden) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await db.delete(tags).where(inArray(tags.id, ids));
  broadcastDataChange("tags");
  return NextResponse.json({ ok: true, deleted: ids.length });
}
