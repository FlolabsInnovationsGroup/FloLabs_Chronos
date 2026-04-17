import { NextResponse } from "next/server";

/** Invitation-based registration is disabled; use FloLabs / Hephaestus provisioning and Sign in. */
export async function GET() {
  return NextResponse.json(
    {
      error:
        "Invitation links are no longer used. If your team provisioned a Chronos account for you, sign in with that email and password.",
    },
    { status: 410 },
  );
}
