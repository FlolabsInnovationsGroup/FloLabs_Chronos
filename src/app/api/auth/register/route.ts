import { NextResponse } from "next/server";

/**
 * Self-service registration via invitation is disabled.
 * Accounts are created through FloLabs / Hephaestus (joined applicants) or other internal provisioning.
 */
export async function POST() {
  return NextResponse.json(
    {
      error:
        "Creating an account from an invitation is disabled. Use the account your team provisioned, or complete onboarding in FloLabs / Hephaestus first.",
    },
    { status: 410 },
  );
}
