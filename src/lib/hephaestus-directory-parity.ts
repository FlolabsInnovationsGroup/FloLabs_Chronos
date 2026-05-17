/**
 * Chronos Users directory visibility must match Hephaestus HR list filters.
 * Base rules from hephaestus-international `buildHrWhere()` (always applied):
 * - exclude merged duplicate secondary rows
 * - exclude closed / archived placeholder emails
 *
 * Chronos team directory uses HR `status=joined` (same cohort as HR “Joined” filter).
 */
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { and, eq, sql, type SQL } from "drizzle-orm";
import { chronosAccessDisabled } from "@/lib/applicant-status";

function isArchivedOrPlaceholderEmail(email: string | null | undefined) {
  const value = String(email ?? "").trim().toLowerCase();
  return value.endsWith("@flolabs.invalid") || value.includes("@imported.local");
}

/** Mirrors Hephaestus HR with `status=joined` (and global duplicate exclusion). */
export function userVisibleMatchingHephaestusJoinedDirectory(input: {
  status: string | null | undefined;
  email?: string | null | undefined;
  isMergedDuplicate?: boolean;
}): boolean {
  if (input.isMergedDuplicate) return false;
  const status = String(input.status ?? "").trim().toLowerCase();
  if (status === "closed") return false;
  if (isArchivedOrPlaceholderEmail(input.email)) return false;
  if (chronosAccessDisabled(input.status)) return false;
  return status === "joined";
}

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
