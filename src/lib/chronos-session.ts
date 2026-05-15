import type { Session } from "next-auth";

/**
 * Chronos ownership / foreign keys use `flolabs_users.id` (exported as `users` in Drizzle).
 * `session.user.chronosUserId` remains populated for backward-compatible JWTs; when absent,
 * `session.user.id` is the same primary key.
 */
export function chronosUserIdFromSessionUser(sessionUser: Session["user"]): string | null {
  const raw = sessionUser.chronosUserId;
  if (typeof raw === "string" && raw.length > 0) return raw;
  const id = typeof sessionUser.id === "string" && sessionUser.id.length > 0 ? sessionUser.id : null;
  return id;
}

export function requireChronosUserIdFromSessionUser(sessionUser: Session["user"]): string {
  const id = chronosUserIdFromSessionUser(sessionUser);
  if (!id) throw new Error("Session is missing Chronos user id");
  return id;
}

/** @deprecated Same as session id after `flolabs_users` unification; kept for call-site clarity. */
export function applicantIdForSessionLinkedUser(sessionUser: Session["user"]): string | null {
  if (!chronosUserIdFromSessionUser(sessionUser)) return null;
  const id = sessionUser.id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

export async function resolveChronosUserIdForSessionUser(sessionUser: Session["user"]): Promise<string | null> {
  return chronosUserIdFromSessionUser(sessionUser);
}
