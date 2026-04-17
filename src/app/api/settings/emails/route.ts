import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { applicants, userEmailAliases, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!db) return NextResponse.json({ emails: [] });

  const [user] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);
  if (!user) return NextResponse.json({ emails: [] });

  const aliasRows = await db
    .select({ email: userEmailAliases.email })
    .from(userEmailAliases)
    .where(eq(userEmailAliases.userId, user.id));

  let applicantEmails: string[] = [];
  try {
    const [applicant] = await db
      .select({ hubspotRawData: applicants.hubspotRawData })
      .from(applicants)
      .where(eq(applicants.chronosUserId, user.id))
      .limit(1);
    if (applicant?.hubspotRawData && typeof applicant.hubspotRawData === "object") {
      const maybeEmails = (applicant.hubspotRawData as { emails?: unknown }).emails;
      if (Array.isArray(maybeEmails)) {
        applicantEmails = maybeEmails.map((v) => String(v).trim().toLowerCase()).filter(Boolean);
      }
    }
  } catch {
    // Compatibility fallback if migrations are pending.
  }

  const emails = Array.from(
    new Set([
      user.email.toLowerCase(),
      ...aliasRows.map((row) => row.email.toLowerCase()),
      ...applicantEmails,
    ]),
  );
  return NextResponse.json({ emails });
}
