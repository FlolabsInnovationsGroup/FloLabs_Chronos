import { and, eq, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { applicants } from "@/lib/db/schema";
import { findUserByAnyEmail } from "@/lib/user-email-aliases";

/** Applicant row for login / recovery when email matches primary or a Chronos user email alias. */
export async function findApplicantForCredentialEmail(normalizedEmail: string) {
  if (!db) return null;

  const [byPrimary] = await db
    .select()
    .from(applicants)
    .where(and(eq(applicants.email, normalizedEmail), ne(applicants.status, "terminated")))
    .limit(1);
  if (byPrimary) return byPrimary;

  const user = await findUserByAnyEmail(normalizedEmail);
  if (!user) return null;

  const [byLink] = await db
    .select()
    .from(applicants)
    .where(and(eq(applicants.chronosUserId, user.id), ne(applicants.status, "terminated")))
    .limit(1);
  return byLink ?? null;
}
