import type { Session } from "next-auth";

/**
 * Chronos ownership / foreign keys use `users.id`.
 * After the identity refactor, `session.user.id` is the canonical applicant (leads) id.
 */
export function chronosUserIdFromSessionUser(sessionUser: Session["user"]): string | null {
  const raw = sessionUser.chronosUserId;
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

export function requireChronosUserIdFromSessionUser(sessionUser: Session["user"]): string {
  const id = chronosUserIdFromSessionUser(sessionUser);
  if (!id) throw new Error("Session is missing chronosUserId (Chronos user linkage)");
  return id;
}
