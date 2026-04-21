import type { Session } from "next-auth";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { applicants } from "@/lib/db/schema";
import { applicantIdForSessionLinkedUser, chronosUserIdFromSessionUser } from "@/lib/chronos-session";

/**
 * Resolves `time_entries.applicant_id` for a write: session applicant when the editor owns the row,
 * otherwise the applicant linked to the entry owner's Chronos user (e.g. admin / team lead edits).
 */
export async function resolveApplicantIdForTimeEntryWrite(
  sessionUser: Session["user"],
  entryOwnerChronosUserId: string
): Promise<string | null> {
  const sessionChronos = chronosUserIdFromSessionUser(sessionUser);
  if (!sessionChronos) return null;
  if (sessionChronos === entryOwnerChronosUserId) {
    return applicantIdForSessionLinkedUser(sessionUser);
  }
  if (!db) return null;
  const [row] = await db
    .select({ id: applicants.id })
    .from(applicants)
    .where(eq(applicants.chronosUserId, entryOwnerChronosUserId))
    .limit(1);
  return row?.id ?? null;
}
