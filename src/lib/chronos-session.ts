import type { Session } from "next-auth";
import { db } from "@/lib/db";
import { applicants } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

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

/** When `chronosUserId` is set, `session.user.id` is the applicant id (Phase 2+ session shape). */
export function applicantIdForSessionLinkedUser(sessionUser: Session["user"]): string | null {
  if (!chronosUserIdFromSessionUser(sessionUser)) return null;
  const id = sessionUser.id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

/**
 * Resolve Chronos owner id even for stale sessions that still only carry applicant id.
 */
export async function resolveChronosUserIdForSessionUser(sessionUser: Session["user"]): Promise<string | null> {
  const direct = chronosUserIdFromSessionUser(sessionUser);
  if (direct) return direct;
  if (!db) return null;

  const applicantId = applicantIdForSessionLinkedUser(sessionUser) ?? (typeof sessionUser.id === "string" ? sessionUser.id : null);
  if (applicantId) {
    const [rowById] = await db
      .select({ chronosUserId: applicants.chronosUserId })
      .from(applicants)
      .where(eq(applicants.id, applicantId))
      .limit(1);
    if (rowById?.chronosUserId) return rowById.chronosUserId;
  }

  const email = String(sessionUser.email ?? "").trim().toLowerCase();
  if (email) {
    const [rowByEmail] = await db
      .select({ chronosUserId: applicants.chronosUserId })
      .from(applicants)
      .where(eq(applicants.email, email))
      .limit(1);
    if (rowByEmail?.chronosUserId) return rowByEmail.chronosUserId;
  }

  return null;
}
