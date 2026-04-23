import { eq, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { applicants, users } from "@/lib/db/schema";

export async function markUserWebsiteVisit(userId: string, email: string, applicantId?: string | null) {
  if (!db) return;

  await db.update(users).set({ updatedAt: new Date() }).where(eq(users.id, userId));
  await db
    .update(applicants)
    .set({ lastWebsiteVisit: new Date(), updatedAt: new Date() })
    .where(
      applicantId
        ? or(eq(applicants.id, applicantId), eq(applicants.chronosUserId, userId), eq(applicants.email, email.toLowerCase()))
        : or(eq(applicants.chronosUserId, userId), eq(applicants.email, email.toLowerCase()))
    );
}
