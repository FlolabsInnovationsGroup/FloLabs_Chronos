import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { invitations } from "@/lib/db/schema";
import { canManageInvitations } from "@/lib/permissions";
import { broadcastDataChange } from "@/lib/realtime";

const patchInvitationSchema = z.object({
  expiresAt: z.string().datetime().optional(),
  disableNow: z.boolean().optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user || !canManageInvitations(session.user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!db) {
    return NextResponse.json({ error: "DB not available" }, { status: 503 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = patchInvitationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  let nextExpiresAt: Date;
  if (parsed.data.disableNow) {
    nextExpiresAt = new Date();
  } else if (parsed.data.expiresAt) {
    nextExpiresAt = new Date(parsed.data.expiresAt);
    if (Number.isNaN(nextExpiresAt.getTime()) || nextExpiresAt.getTime() <= Date.now()) {
      return NextResponse.json({ error: "Expiration must be a valid future date." }, { status: 400 });
    }
  } else {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const [invite] = await db
    .update(invitations)
    .set({ expiresAt: nextExpiresAt })
    .where(and(eq(invitations.id, id), isNull(invitations.acceptedAt)))
    .returning({ id: invitations.id, expiresAt: invitations.expiresAt });

  if (!invite) {
    return NextResponse.json({ error: "Invitation not found or already accepted." }, { status: 404 });
  }

  broadcastDataChange("team");
  return NextResponse.json({ ok: true, invitation: invite });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
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
