import { eq, inArray } from "drizzle-orm";
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
export async function chronosActorDisplayMap(
  actors: Array<{ userId: string | null | undefined; applicantId?: string | null }>
): Promise<Map<string, { id: string; name: string } | null>> {
  const map = new Map<string, { id: string; name: string } | null>();
  if (!db || actors.length === 0) return map;

  const applicantIds = [...new Set(actors.map((actor) => actor.applicantId).filter((v): v is string => !!v))];
  const userIds = [...new Set(actors.map((actor) => actor.userId).filter((v): v is string => !!v))];

  const [applicantRows, linkedApplicantRows, userRows] = await Promise.all([
    applicantIds.length > 0
      ? db
          .select({
            applicantId: applicants.id,
            chronosUserId: applicants.chronosUserId,
            applicantName: applicants.name,
            userName: users.name,
          })
          .from(applicants)
          .leftJoin(users, eq(applicants.chronosUserId, users.id))
          .where(inArray(applicants.id, applicantIds))
      : Promise.resolve([]),
    userIds.length > 0
      ? db
          .select({
            applicantId: applicants.id,
            chronosUserId: applicants.chronosUserId,
            applicantName: applicants.name,
            userName: users.name,
          })
          .from(applicants)
          .leftJoin(users, eq(applicants.chronosUserId, users.id))
          .where(inArray(applicants.chronosUserId, userIds))
      : Promise.resolve([]),
    userIds.length > 0
      ? db
          .select({ userId: users.id, userName: users.name })
          .from(users)
          .where(inArray(users.id, userIds))
      : Promise.resolve([]),
  ]);

  const applicantById = new Map(applicantRows.map((row) => [row.applicantId, row]));
  const linkedApplicantByUserId = new Map(
    linkedApplicantRows
      .filter((row) => !!row.chronosUserId)
      .map((row) => [row.chronosUserId as string, row])
  );
  const userById = new Map(userRows.map((row) => [row.userId, row]));

  for (const actor of actors) {
    const key = `${actor.userId ?? ""}:${actor.applicantId ?? ""}`;
    const applicant = actor.applicantId ? applicantById.get(actor.applicantId) : null;
    const linkedApplicant = actor.userId ? linkedApplicantByUserId.get(actor.userId) : null;
    const user = actor.userId ? userById.get(actor.userId) : null;
    const preferredApplicant = applicant ?? linkedApplicant ?? null;

    if (preferredApplicant || user) {
      map.set(key, {
        id: actor.userId ?? preferredApplicant?.chronosUserId ?? preferredApplicant?.applicantId ?? user?.userId ?? "",
        name: preferredApplicant?.applicantName?.trim() || preferredApplicant?.userName || user?.userName || "Unknown",
      });
    } else {
      map.set(key, null);
    }
  }

  return map;
}

export async function chronosActorDisplay(
  userId: string | null | undefined,
  applicantId?: string | null
): Promise<{ id: string; name: string } | null> {
  const map = await chronosActorDisplayMap([{ userId, applicantId }]);
  return map.get(`${userId ?? ""}:${applicantId ?? ""}`) ?? null;
}

export async function chronosEntryOwnerDisplayMap(
  owners: Array<{ userId: string | null | undefined; applicantId?: string | null }>
): Promise<Map<string, { id: string; name: string; email: string | null }>> {
  const map = new Map<string, { id: string; name: string; email: string | null }>();
  if (!db || owners.length === 0) return map;

  const applicantIds = [...new Set(owners.map((o) => o.applicantId).filter((v): v is string => !!v))];
  const userIds = [...new Set(owners.map((o) => o.userId).filter((v): v is string => !!v))];

  const [applicantRows, linkedApplicantRows, userRows] = await Promise.all([
    applicantIds.length > 0
      ? db
          .select({
            applicantId: applicants.id,
            chronosUserId: applicants.chronosUserId,
            name: applicants.name,
            email: applicants.email,
          })
          .from(applicants)
          .where(inArray(applicants.id, applicantIds))
      : Promise.resolve([]),
    userIds.length > 0
      ? db
          .select({
            applicantId: applicants.id,
            chronosUserId: applicants.chronosUserId,
            name: applicants.name,
            email: applicants.email,
          })
          .from(applicants)
          .where(inArray(applicants.chronosUserId, userIds))
      : Promise.resolve([]),
    userIds.length > 0
      ? db
          .select({ id: users.id, name: users.name, email: users.email })
          .from(users)
          .where(inArray(users.id, userIds))
      : Promise.resolve([]),
  ]);

  const applicantById = new Map(applicantRows.map((row) => [row.applicantId, row]));
  const linkedApplicantByUserId = new Map(
    linkedApplicantRows
      .filter((row) => !!row.chronosUserId)
      .map((row) => [row.chronosUserId as string, row])
  );
  const userById = new Map(userRows.map((row) => [row.id, row]));

  for (const owner of owners) {
    const key = `${owner.userId ?? ""}:${owner.applicantId ?? ""}`;
    const applicant = owner.applicantId ? applicantById.get(owner.applicantId) : null;
    const linkedApplicant = owner.userId ? linkedApplicantByUserId.get(owner.userId) : null;
    const user = owner.userId ? userById.get(owner.userId) : null;
    const preferredApplicant = applicant ?? linkedApplicant ?? null;

    if (preferredApplicant || user) {
      map.set(key, {
        id: owner.userId ?? preferredApplicant?.chronosUserId ?? preferredApplicant?.applicantId ?? user?.id ?? "",
        name: preferredApplicant?.name?.trim() || user?.name || "Unknown",
        email: preferredApplicant?.email?.trim() || user?.email || null,
      });
    }
  }

  return map;
}
