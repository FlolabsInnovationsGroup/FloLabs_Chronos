import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

/** Display name and Notion Team Member page id from the unified `flolabs_users` row. */
export async function chronosUserDisplayAndNotionTeamMemberId(userId: string): Promise<{
  name: string;
  notionTeamMemberId: string | null;
} | null> {
  if (!db) return null;

  const [row] = await db
    .select({
      userName: users.name,
      userNotion: users.notionTeamMemberId,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!row) return null;
  return {
    name: row.userName,
    notionTeamMemberId: row.userNotion?.trim() || null,
  };
}

/** Display helper for discussion/reply actors (`applicantId` is legacy naming for `flolabs_users.id`). */
export async function chronosActorDisplayMap(
  actors: Array<{ userId: string | null | undefined; applicantId?: string | null }>
): Promise<Map<string, { id: string; name: string } | null>> {
  const map = new Map<string, { id: string; name: string } | null>();
  if (!db || actors.length === 0) return map;

  const applicantIds = [...new Set(actors.map((actor) => actor.applicantId).filter((v): v is string => !!v))];
  const userIds = [...new Set(actors.map((actor) => actor.userId).filter((v): v is string => !!v))];
  const allIds = [...new Set([...applicantIds, ...userIds])];

  const rows =
    allIds.length > 0
      ? await db
          .select({ id: users.id, name: users.name })
          .from(users)
          .where(inArray(users.id, allIds))
      : [];

  const byId = new Map(rows.map((r) => [r.id, r]));

  for (const actor of actors) {
    const key = `${actor.userId ?? ""}:${actor.applicantId ?? ""}`;
    const row = (actor.applicantId && byId.get(actor.applicantId)) || (actor.userId && byId.get(actor.userId)) || null;
    if (row) {
      map.set(key, { id: row.id, name: row.name });
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
  const allIds = [...new Set([...applicantIds, ...userIds])];

  const rows =
    allIds.length > 0
      ? await db
          .select({ id: users.id, name: users.name, email: users.email })
          .from(users)
          .where(inArray(users.id, allIds))
      : [];

  const byId = new Map(rows.map((r) => [r.id, r]));

  for (const owner of owners) {
    const key = `${owner.userId ?? ""}:${owner.applicantId ?? ""}`;
    const row = (owner.applicantId && byId.get(owner.applicantId)) || (owner.userId && byId.get(owner.userId)) || null;
    if (row) {
      map.set(key, { id: row.id, name: row.name, email: row.email });
    }
  }

  return map;
}
