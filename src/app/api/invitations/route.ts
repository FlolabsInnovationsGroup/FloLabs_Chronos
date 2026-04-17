import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canManageInvitations } from "@/lib/permissions";

const INVITATIONS_DISABLED =
  "Invitations are disabled. New Chronos accounts are provisioned through FloLabs / Hephaestus for applicants on the Joined pipeline; existing users should sign in.";

export async function GET() {
  const session = await auth();
  if (!session?.user || !canManageInvitations(session.user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json({ invitations: [] });
}

export async function POST() {
  const session = await auth();
  if (!session?.user || !canManageInvitations(session.user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json({ error: INVITATIONS_DISABLED }, { status: 410 });
}
