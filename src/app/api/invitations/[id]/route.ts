import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canManageInvitations } from "@/lib/permissions";

const GONE = "Invitations are disabled.";

export async function PATCH() {
  const session = await auth();
  if (!session?.user || !canManageInvitations(session.user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json({ error: GONE }, { status: 410 });
}

export async function DELETE() {
  const session = await auth();
  if (!session?.user || !canManageInvitations(session.user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json({ error: GONE }, { status: 410 });
}
