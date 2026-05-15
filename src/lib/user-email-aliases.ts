import { and, eq, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import { userEmailAliases, users } from '@/lib/db/schema';

export async function ensureUserEmailAliasesSchema() {
  if (!db) return;

  await db.execute(`
    create table if not exists user_email_aliases (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references flolabs_users(id) on delete cascade,
      email text not null unique,
      is_primary boolean not null default false,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `);
}

export async function addEmailAlias(userId: string, email: string, isPrimary = false) {
  if (!db) return;
  await ensureUserEmailAliasesSchema();
  await db.insert(userEmailAliases).values({ userId, email: email.toLowerCase(), isPrimary }).onConflictDoNothing();
}

export async function addPrimaryEmailAlias(userId: string, email: string) {
  return addEmailAlias(userId, email, true);
}

export async function findUserByAnyEmail(email: string) {
  if (!db) return null;
  await ensureUserEmailAliasesSchema();
  const normalized = email.trim().toLowerCase();

  const [direct] = await db.select().from(users).where(eq(users.email, normalized)).limit(1);
  if (direct) return direct;

  const [alias] = await db.select({ user: users }).from(userEmailAliases).innerJoin(users, eq(userEmailAliases.userId, users.id)).where(eq(userEmailAliases.email, normalized)).limit(1);
  return alias?.user ?? null;
}

export async function getUserEmails(userId: string) {
  if (!db) return [] as string[];
  await ensureUserEmailAliasesSchema();
  const rows = await db.select({ email: userEmailAliases.email }).from(userEmailAliases).where(eq(userEmailAliases.userId, userId));
  return rows.map((row) => row.email);
}
