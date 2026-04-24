import type { Session } from "next-auth";
import { and, eq, isNull, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { applicants, timeEntries } from "@/lib/db/schema";
import { applicantIdForSessionLinkedUser, chronosUserIdFromSessionUser } from "@/lib/chronos-session";

/**
 * Resolves `time_entries.flolabs_id` for a write: session applicant when the editor owns the row,
 * otherwise the applicant linked to the entry owner's Chronos user (e.g. admin / team lead edits).
 */
export async function resolveFlolabsIdForTimeEntryWrite(
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

/**
 * Compatible read scope:
 * - Prefer canonical `flolabs_id`
 * - Fall back to legacy `user_id` for rows not yet backfilled
 */
export function whereTimeEntriesForLinkedUser(_chronosUserId: string, flolabsId: string | null) {
  if (flolabsId) {
    return or(
      eq(timeEntries.flolabsId, flolabsId),
      and(isNull(timeEntries.flolabsId), eq(timeEntries.userId, _chronosUserId))
    )!;
  }
  return eq(timeEntries.userId, _chronosUserId);
}
