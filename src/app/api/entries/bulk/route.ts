import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { timeEntries } from "@/lib/db/schema";
import { inArray } from "drizzle-orm";
import { z } from "zod";

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
  const isAdmin = session.user.role === "admin";

  // Fetch entries and verify ownership
  const found = await db
    .select({ id: timeEntries.id, userId: timeEntries.userId })
    .from(timeEntries)
    .where(inArray(timeEntries.id, entryIds));

  if (found.length !== entryIds.length) {
    return NextResponse.json({ error: "Some entries not found" }, { status: 404 });
  }

  if (!isAdmin) {
    const forbidden = found.some((e) => e.userId !== session.user.id);
    if (forbidden) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (action === "delete") {
    await db.delete(timeEntries).where(inArray(timeEntries.id, entryIds));
    return NextResponse.json({ success: true, deleted: entryIds.length });
  }

  // action === "changeProject"
  await db
    .update(timeEntries)
    .set({ projectId: parsed.data.projectId, updatedAt: new Date() })
    .where(inArray(timeEntries.id, entryIds));
  return NextResponse.json({ success: true, updated: entryIds.length });
}
