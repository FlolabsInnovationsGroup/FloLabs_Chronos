import { eq, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

export async function markUserWebsiteVisit(userId: string, email: string, applicantId?: string | null) {
  if (!db) return;

  await db
    .update(users)
    .set({
      lastWebsiteVisit: new Date(),
      lastVisitedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      applicantId
        ? or(eq(users.id, applicantId), eq(users.id, userId), eq(users.email, email.toLowerCase()))
        : or(eq(users.id, userId), eq(users.email, email.toLowerCase()))
    );
}
