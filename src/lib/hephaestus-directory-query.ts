import "server-only";

import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { and, eq, sql, type SQL } from "drizzle-orm";

/** SQL `WHERE` fragment matching Hephaestus `buildHrWhere({ status: 'joined' })`. */
export function hephaestusJoinedDirectorySqlWhere(): SQL {
  return and(
    sql`${users.id} not in (
      select duplicate_applicant_id from applicant_duplicate_reviews where status = 'merged'
    )`,
    sql`coalesce(${users.status}, '') <> 'closed'`,
    sql`lower(trim(${users.email})) not like '%@imported.local%'`,
    sql`lower(trim(${users.email})) not like '%@flolabs.invalid%'`,
    sql`lower(coalesce(${users.status}, '')) not in ('graduated', 'terminated')`,
    eq(users.status, "joined"),
  )!;
}

export async function listFlolabsUsersInHephaestusJoinedDirectory() {
  if (!db) return [];
  return db.select().from(users).where(hephaestusJoinedDirectorySqlWhere());
}
