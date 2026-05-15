import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { findUserByAnyEmail } from "@/lib/user-email-aliases";

/** FloLabs user row for login / recovery when email matches primary or a Chronos user email alias. */
export async function findApplicantForCredentialEmail(normalizedEmail: string) {
  if (!db) return null;

  const [byPrimary] = await db
    .select()
    .from(users)
    .where(and(eq(users.email, normalizedEmail), ne(users.status, "terminated")))
    .limit(1);
  if (byPrimary) return byPrimary;

  const [byHubspotEmail] = await db
    .select()
    .from(users)
    .where(
      and(
        ne(users.status, "terminated"),
        sql`EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(COALESCE(${users.hubspotRawData}->'emails', '[]'::jsonb)) AS e(email)
          WHERE lower(e.email) = ${normalizedEmail}
        )`
      )
    )
    .limit(1);
  if (byHubspotEmail) return byHubspotEmail;

  const [byHubspotRawText] = await db
    .select()
    .from(users)
    .where(
      and(
        ne(users.status, "terminated"),
        sql`lower(COALESCE(${users.hubspotRawData}::text, '')) LIKE ${`%${normalizedEmail}%`}`
      )
    )
    .limit(1);
  if (byHubspotRawText) return byHubspotRawText;

  const linked = await findUserByAnyEmail(normalizedEmail);
  if (!linked) return null;

  const [byLink] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, linked.id), ne(users.status, "terminated")))
    .limit(1);
  return byLink ?? null;
}
