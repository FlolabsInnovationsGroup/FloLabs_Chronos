import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { applicants, userEmailAliases, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!db) return NextResponse.json({ emails: [] });

  const sessionApplicantId = session.user.id;
  const sessionChronosUserId = session.user.chronosUserId ?? null;

  const [applicant] = await db
    .select({ email: applicants.email, hubspotRawData: applicants.hubspotRawData })
    .from(applicants)
    .where(eq(applicants.id, sessionApplicantId))
    .limit(1);
  if (!applicant) return NextResponse.json({ emails: [] });

  const [user] = sessionChronosUserId
    ? await db
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(eq(users.id, sessionChronosUserId))
        .limit(1)
    : [];

  const aliasRows = await db
    .select({ email: userEmailAliases.email })
    .from(userEmailAliases)
    .where(eq(userEmailAliases.userId, sessionChronosUserId ?? ""));

  let applicantEmails: string[] = [];
  if (applicant?.hubspotRawData && typeof applicant.hubspotRawData === "object") {
    const maybeEmails = (applicant.hubspotRawData as { emails?: unknown }).emails;
    if (Array.isArray(maybeEmails)) {
      applicantEmails = maybeEmails.map((v) => String(v).trim().toLowerCase()).filter(Boolean);
    }
  }

  const emails = Array.from(
    new Set([
      applicant.email.toLowerCase(),
      ...(user ? [user.email.toLowerCase()] : []),
      ...aliasRows.map((row) => row.email.toLowerCase()),
      ...applicantEmails,
    ]),
  );
  return NextResponse.json({ emails });
}
