import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { invitations } from "@/lib/db/schema";
import { canManageInvitations } from "@/lib/permissions";
import { broadcastDataChange } from "@/lib/realtime";

export async function PATCH(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || !canManageInvitations(session.user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!db) {
    return NextResponse.json({ error: "DB not available" }, { status: 503 });
  }

  const { id } = await params;

  const [invite] = await db
    .update(invitations)
    .set({ expiresAt: new Date() })
    .where(and(eq(invitations.id, id), isNull(invitations.acceptedAt)))
    .returning({ id: invitations.id });

  if (!invite) {
    return NextResponse.json({ error: "Invitation not found or already accepted." }, { status: 404 });
  }

  broadcastDataChange("team");
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || !canManageInvitations(session.user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!db) {
    return NextResponse.json({ error: "DB not available" }, { status: 503 });
  }

  const { id } = await params;

  const [invite] = await db
    .delete(invitations)
    .where(eq(invitations.id, id))
    .returning({ id: invitations.id });

  if (!invite) {
    return NextResponse.json({ error: "Invitation not found." }, { status: 404 });
  }

  broadcastDataChange("team");
  return NextResponse.json({ ok: true });
}
