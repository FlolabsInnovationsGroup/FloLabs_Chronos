import type { Session } from "next-auth";
import { eq, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { timeEntries, users } from "@/lib/db/schema";
import { applicantIdForSessionLinkedUser, chronosUserIdFromSessionUser } from "@/lib/chronos-session";

/**
 * Resolves `time_entries.flolabs_id` for a write: session user id when the editor owns the row,
 * otherwise the FloLabs user id for the entry owner (e.g. admin / team lead edits).
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
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, entryOwnerChronosUserId))
    .limit(1);
  return row?.id ?? entryOwnerChronosUserId;
}

/**
 * Compatible read scope:
 * - Prefer canonical `flolabs_id`
 * - Fall back to legacy `user_id` for rows not yet backfilled
 */
export function whereTimeEntriesForLinkedUser(_chronosUserId: string, flolabsId: string | null) {
  if (flolabsId) {
    return or(eq(timeEntries.userId, _chronosUserId), eq(timeEntries.flolabsId, flolabsId))!;
  }
  return eq(timeEntries.userId, _chronosUserId);
}
