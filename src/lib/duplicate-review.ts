import { eq, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import { applicantDuplicateReviews, applicants, users } from '@/lib/db/schema';
import { addEmailAlias, ensureUserEmailAliasesSchema } from '@/lib/user-email-aliases';

export type DuplicateReviewStatus = 'pending' | 'confirmed_duplicate' | 'different_people' | 'merged';
const AUTO_MERGE_SCORE_THRESHOLD = 9;

function normalizeValue(value: string | null | undefined) {
  return String(value ?? '').trim().toLowerCase();
}

function chooseLongestNameApplicant<T extends { id: string; name: string | null }>(first: T, second: T): T {
  const firstName = String(first.name ?? '').trim();
  const secondName = String(second.name ?? '').trim();
  if (secondName.length > firstName.length) return second;
  return first;
}

function scorePair(applicant: any, other: any) {
  let score = 0;
  const reasons: string[] = [];
  let strongSignals = 0;

  if (normalizeValue(applicant.phone) && normalizeValue(applicant.phone) === normalizeValue(other.phone)) {
    score += 6;
    strongSignals += 1;
    reasons.push('same phone number');
  }
  if (normalizeValue(applicant.linkedinUrl) && normalizeValue(applicant.linkedinUrl) === normalizeValue(other.linkedinUrl)) {
    score += 4;
    strongSignals += 1;
    reasons.push('same LinkedIn URL');
  }
  if (normalizeValue(applicant.name) && normalizeValue(applicant.name) === normalizeValue(other.name)) {
    score += 3;
    reasons.push('same full name');
  }
  if (normalizeValue(applicant.city) && normalizeValue(applicant.city) === normalizeValue(other.city)) {
    score += 1;
    reasons.push('same city');
  }
  if (normalizeValue(applicant.country) && normalizeValue(applicant.country) === normalizeValue(other.country)) {
    score += 1;
    reasons.push('same country');
  }
  if (normalizeValue(applicant.education) && normalizeValue(applicant.education) === normalizeValue(other.education)) {
    score += 1;
    reasons.push('same education');
  }
  if (normalizeValue(applicant.roleAppliedFor) && normalizeValue(applicant.roleAppliedFor) === normalizeValue(other.roleAppliedFor)) {
    score += 1;
    reasons.push('same role applied for');
  }

  return { score, reasons, strongSignals };
}

export async function ensureDuplicateReviewSchema() {
  if (!db) return;

  await db.execute(`
    create table if not exists applicant_duplicate_reviews (
      id uuid primary key default gen_random_uuid(),
      primary_applicant_id uuid not null references applicants(id) on delete cascade,
      duplicate_applicant_id uuid not null references applicants(id) on delete cascade,
      status text not null default 'pending',
      confidence_score bigint not null default 0,
      reasons jsonb not null default '[]'::jsonb,
      reviewed_by_id uuid references users(id) on delete set null,
      reviewed_at timestamptz,
      notes text,
      canonical_applicant_id uuid references applicants(id) on delete set null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint applicant_duplicate_reviews_pair_unique unique (primary_applicant_id, duplicate_applicant_id)
    )
  `);
}

export async function syncDuplicateReviews() {
  if (!db) return [];
  await ensureDuplicateReviewSchema();

  const rows = await db.select().from(applicants);
  const upserts: Array<{
    primaryApplicantId: string;
    duplicateApplicantId: string;
    confidenceScore: number;
    reasons: string[];
    autoMerge: boolean;
    canonicalApplicantId: string;
  }> = [];

  for (let i = 0; i < rows.length; i += 1) {
    for (let j = i + 1; j < rows.length; j += 1) {
      const applicant = rows[i];
      const other = rows[j];
      if (normalizeValue(applicant.email) === normalizeValue(other.email)) continue;

      const { score, reasons, strongSignals } = scorePair(applicant, other);
      if (score < 7) continue;
      if (strongSignals === 0) continue;
      if (strongSignals === 1 && reasons.length < 3) continue;

      const [primaryApplicantId, duplicateApplicantId] = [applicant.id, other.id].sort();
      const canonicalApplicantId = chooseLongestNameApplicant(applicant, other).id;
      upserts.push({
        primaryApplicantId,
        duplicateApplicantId,
        confidenceScore: score,
        reasons,
        autoMerge: score >= AUTO_MERGE_SCORE_THRESHOLD,
        canonicalApplicantId,
      });
    }
  }

  for (const item of upserts) {
    const [review] = await db.insert(applicantDuplicateReviews).values({
      primaryApplicantId: item.primaryApplicantId,
      duplicateApplicantId: item.duplicateApplicantId,
      confidenceScore: item.confidenceScore,
      reasons: item.reasons,
      status: 'pending',
    }).onConflictDoUpdate({
      target: [applicantDuplicateReviews.primaryApplicantId, applicantDuplicateReviews.duplicateApplicantId],
      set: {
        confidenceScore: item.confidenceScore,
        reasons: item.reasons,
        updatedAt: new Date(),
      },
    }).returning();

    if (
      item.autoMerge &&
      review &&
      review.status !== 'merged' &&
      review.status !== 'different_people'
    ) {
      await updateDuplicateReview({
        reviewId: review.id,
        status: 'merged',
        notes: `Auto-merged because score is ${item.confidenceScore} (>= ${AUTO_MERGE_SCORE_THRESHOLD}).`,
        canonicalApplicantId: item.canonicalApplicantId,
      });
    }
  }

  return upserts;
}

export async function getDuplicateReviewsForApplicant(applicantId: string) {
  if (!db) return [];
  await ensureDuplicateReviewSchema();

  return db
    .select()
    .from(applicantDuplicateReviews)
    .where(or(eq(applicantDuplicateReviews.primaryApplicantId, applicantId), eq(applicantDuplicateReviews.duplicateApplicantId, applicantId)));
}

export async function updateDuplicateReview(input: {
  reviewId: string;
  status: DuplicateReviewStatus;
  reviewedById?: string | null;
  notes?: string | null;
  canonicalApplicantId?: string | null;
}) {
  if (!db) return null;
  await ensureDuplicateReviewSchema();

  const [updated] = await db
    .update(applicantDuplicateReviews)
    .set({
      status: input.status,
      reviewedById: input.reviewedById ?? null,
      reviewedAt: new Date(),
      notes: input.notes ?? null,
      canonicalApplicantId: input.canonicalApplicantId ?? null,
      updatedAt: new Date(),
    })
    .where(eq(applicantDuplicateReviews.id, input.reviewId))
    .returning();

  if (updated && input.status === 'merged') {
    await ensureUserEmailAliasesSchema();
    const [primaryApplicant] = await db.select().from(applicants).where(eq(applicants.id, updated.primaryApplicantId)).limit(1);
    const [duplicateApplicant] = await db.select().from(applicants).where(eq(applicants.id, updated.duplicateApplicantId)).limit(1);

    const canonicalApplicant = input.canonicalApplicantId === updated.duplicateApplicantId ? duplicateApplicant : primaryApplicant;
    const secondaryApplicant = canonicalApplicant?.id === primaryApplicant?.id ? duplicateApplicant : primaryApplicant;
    const longestName = chooseLongestNameApplicant(
      { id: canonicalApplicant?.id ?? '', name: canonicalApplicant?.name ?? '' },
      { id: secondaryApplicant?.id ?? '', name: secondaryApplicant?.name ?? '' },
    ).name;

    if (canonicalApplicant?.id && longestName && normalizeValue(canonicalApplicant.name) !== normalizeValue(longestName)) {
      await db.update(applicants).set({ name: longestName, updatedAt: new Date() }).where(eq(applicants.id, canonicalApplicant.id));
    }

    const canonicalEmail = canonicalApplicant?.email ?? null;
    if (canonicalEmail) {
      const [canonicalUser] = await db.select().from(users).where(eq(users.email, canonicalEmail)).limit(1);
      if (canonicalUser) {
        if (longestName && normalizeValue(canonicalUser.name) !== normalizeValue(longestName)) {
          await db.update(users).set({ name: longestName, updatedAt: new Date() }).where(eq(users.id, canonicalUser.id));
        }
        await addEmailAlias(canonicalUser.id, canonicalEmail, true);
        if (secondaryApplicant?.email) {
          await addEmailAlias(canonicalUser.id, secondaryApplicant.email);
        }
      }
    }
  }

  return updated ?? null;
}
