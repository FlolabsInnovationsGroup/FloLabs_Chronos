import { eq, sql, type SQL } from "drizzle-orm";
import { tags } from "@/lib/db/schema";
import { applicantIdForSessionLinkedUser, chronosUserIdFromSessionUser } from "@/lib/chronos-session";
import type { Session } from "next-auth";

/**
 * SQL scope for tag rows owned by a linked FloLabs account.
 */
export function whereTagsForLinkedUser(
  _chronosUserId: string,
  flolabsId: string | null
): SQL {
  if (flolabsId) {
    return eq(tags.flolabsId, flolabsId);
  }
  return sql`1 = 0`;
}

export function tagRowOwnedByLinkedUser(
  row: { flolabsId: string | null; applicantId?: string | null },
  _chronosUserId: string,
  flolabsId: string | null
): boolean {
  if (flolabsId && row.flolabsId === flolabsId) return true;
  if (flolabsId && row.applicantId === flolabsId) return true;
  return false;
}

export function tagRowAccessibleBySession(
  row: { flolabsId: string | null; applicantId?: string | null },
  sessionUser: Session["user"]
): boolean {
  const c = chronosUserIdFromSessionUser(sessionUser);
  if (!c) return false;
  return tagRowOwnedByLinkedUser(row, c, applicantIdForSessionLinkedUser(sessionUser));
}
