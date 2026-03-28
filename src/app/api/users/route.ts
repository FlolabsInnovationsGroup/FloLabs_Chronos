import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getAccessibleUsers } from "@/lib/permissions";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await getAccessibleUsers(session.user);
  return NextResponse.json({ users: rows });
}

export async function POST() {
  return NextResponse.json(
    { error: "Direct user creation is disabled. Use invitations instead." },
    { status: 405 }
  );
}
