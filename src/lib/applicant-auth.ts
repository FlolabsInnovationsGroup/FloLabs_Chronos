import { and, eq, ne, sql } from "drizzle-orm";
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

  // Legacy/import compatibility: some users type an alternate email that only exists
  // inside applicant hubspotRawData.emails, not applicants.email.
  const [byHubspotEmail] = await db
    .select()
    .from(applicants)
    .where(
      and(
        ne(applicants.status, "terminated"),
        sql`EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(COALESCE(${applicants.hubspotRawData}->'emails', '[]'::jsonb)) AS e(email)
          WHERE lower(e.email) = ${normalizedEmail}
        )`
      )
    )
    .limit(1);
  if (byHubspotEmail) return byHubspotEmail;

  // Last-resort compatibility for heterogeneous HubSpot payload shapes:
  // match on serialized JSON text when the email is present but not in the canonical `emails` array.
  const [byHubspotRawText] = await db
    .select()
    .from(applicants)
    .where(
      and(
        ne(applicants.status, "terminated"),
        sql`lower(COALESCE(${applicants.hubspotRawData}::text, '')) LIKE ${`%${normalizedEmail}%`}`
      )
    )
    .limit(1);
  if (byHubspotRawText) return byHubspotRawText;

  const user = await findUserByAnyEmail(normalizedEmail);
  if (!user) return null;

  const [byLink] = await db
    .select()
    .from(applicants)
    .where(and(eq(applicants.chronosUserId, user.id), ne(applicants.status, "terminated")))
    .limit(1);
  return byLink ?? null;
}
