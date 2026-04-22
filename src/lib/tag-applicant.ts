import { eq, or, type SQL } from "drizzle-orm";
import { tags } from "@/lib/db/schema";
import { applicantIdForSessionLinkedUser, chronosUserIdFromSessionUser } from "@/lib/chronos-session";
import type { Session } from "next-auth";

/**
 * SQL scope for tag rows owned by a linked Chronos user (compat `user_id` and/or `applicant_id`).
 */
export function whereTagsForLinkedUser(
  chronosUserId: string,
  applicantId: string | null
): SQL {
  if (applicantId) {
    return or(eq(tags.userId, chronosUserId), eq(tags.applicantId, applicantId))!;
  }
  return eq(tags.userId, chronosUserId);
}

export function tagRowOwnedByLinkedUser(
  row: { userId: string; applicantId: string | null },
  chronosUserId: string,
  applicantId: string | null
): boolean {
  if (row.userId === chronosUserId) return true;
  if (applicantId && row.applicantId === applicantId) return true;
  return false;
}

export function tagRowAccessibleBySession(
  row: { userId: string; applicantId: string | null },
  sessionUser: Session["user"]
): boolean {
  const c = chronosUserIdFromSessionUser(sessionUser);
  if (!c) return false;
  return tagRowOwnedByLinkedUser(row, c, applicantIdForSessionLinkedUser(sessionUser));
}
