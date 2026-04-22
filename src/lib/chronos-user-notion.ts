import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { applicants, users } from "@/lib/db/schema";

/** Display name and Notion Team Member page id: applicant fields win when linked. */
export async function chronosUserDisplayAndNotionTeamMemberId(userId: string): Promise<{
  name: string;
  notionTeamMemberId: string | null;
} | null> {
  if (!db) return null;

  const [row] = await db
    .select({
      userName: users.name,
      userNotion: users.notionTeamMemberId,
      applicantName: applicants.name,
      applicantNotion: applicants.notionTeamMemberId,
    })
    .from(users)
    .leftJoin(applicants, eq(applicants.chronosUserId, users.id))
    .where(eq(users.id, userId))
    .limit(1);

  if (!row) return null;
  const name = row.applicantName?.trim() || row.userName;
  const notionTeamMemberId = row.applicantNotion?.trim() || row.userNotion?.trim() || null;
  return { name, notionTeamMemberId };
}

/** Applicant-canonical display helper for discussion/reply actors. */
export async function chronosActorDisplay(
  userId: string | null | undefined,
  applicantId?: string | null
): Promise<{ id: string; name: string } | null> {
  if (!db) return null;

  if (applicantId) {
    const [row] = await db
      .select({
        applicantId: applicants.id,
        chronosUserId: applicants.chronosUserId,
        applicantName: applicants.name,
        userName: users.name,
      })
      .from(applicants)
      .leftJoin(users, eq(applicants.chronosUserId, users.id))
      .where(eq(applicants.id, applicantId))
      .limit(1);

    if (row) {
      return {
        id: userId ?? row.chronosUserId ?? row.applicantId,
        name: row.applicantName?.trim() || row.userName || "Unknown",
      };
    }
  }

  if (!userId) return null;

  const [row] = await db
    .select({
      userId: users.id,
      userName: users.name,
      applicantName: applicants.name,
    })
    .from(users)
    .leftJoin(applicants, eq(applicants.chronosUserId, users.id))
    .where(eq(users.id, userId))
    .limit(1);

  if (!row) return null;
  return {
    id: row.userId,
    name: row.applicantName?.trim() || row.userName,
  };
}
