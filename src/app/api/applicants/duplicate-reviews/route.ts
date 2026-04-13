import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { applicants } from '@/lib/db/schema';
import { eq, or } from 'drizzle-orm';
import { getDuplicateReviewsForApplicant, syncDuplicateReviews, updateDuplicateReview } from '@/lib/duplicate-review';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user || !['admin', 'team_lead', 'hr'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const applicantId = searchParams.get('applicantId');

  if (!applicantId) {
    const synced = await syncDuplicateReviews();
    return NextResponse.json({ syncedCount: synced.length });
  }

  const reviews = await getDuplicateReviewsForApplicant(applicantId);
  return NextResponse.json({ reviews });
}

export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user || !['admin', 'team_lead', 'hr'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!db) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const sync = searchParams.get('sync');

  if (sync === '1') {
    const synced = await syncDuplicateReviews();
    return NextResponse.json({ syncedCount: synced.length });
  }

  const reviews = await db.query.applicantDuplicateReviews.findMany({
    with: {},
  }).catch(async () => {
    const rows = await getDuplicateReviewsForApplicant(searchParams.get('applicantId') ?? '');
    return rows;
  });

  const applicantIds = Array.from(new Set(reviews.flatMap((review: any) => [review.primaryApplicantId ?? review.primary_applicant_id, review.duplicateApplicantId ?? review.duplicate_applicant_id]).filter(Boolean)));
  const applicantRows = applicantIds.length > 0
    ? await db.select().from(applicants).where(or(...applicantIds.map((id) => eq(applicants.id, id))))
    : [];
  const applicantMap = new Map(applicantRows.map((row) => [row.id, row]));

  const filtered = reviews
    .filter((review: any) => !status || (review.status === status))
    .map((review: any) => ({
      ...review,
      primaryApplicant: applicantMap.get(review.primaryApplicantId ?? review.primary_applicant_id) ?? null,
      duplicateApplicant: applicantMap.get(review.duplicateApplicantId ?? review.duplicate_applicant_id) ?? null,
    }));

  return NextResponse.json({ reviews: filtered });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || !['admin', 'team_lead', 'hr'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const reviewId = String(body.reviewId ?? '');
  const status = String(body.status ?? '');
  const notes = typeof body.notes === 'string' ? body.notes : null;
  const canonicalApplicantId = typeof body.canonicalApplicantId === 'string' ? body.canonicalApplicantId : null;

  if (!reviewId || !['pending', 'confirmed_duplicate', 'different_people', 'merged'].includes(status)) {
    return NextResponse.json({ error: 'reviewId and valid status are required' }, { status: 400 });
  }

  const review = await updateDuplicateReview({
    reviewId,
    status: status as 'pending' | 'confirmed_duplicate' | 'different_people' | 'merged',
    reviewedById: session.user.id,
    notes,
    canonicalApplicantId,
  });

  return NextResponse.json({ review });
}
