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
