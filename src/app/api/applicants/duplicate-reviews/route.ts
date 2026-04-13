import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
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

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || !['admin', 'team_lead', 'hr'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const reviewId = String(body.reviewId ?? '');
  const status = String(body.status ?? '');
  const notes = typeof body.notes === 'string' ? body.notes : null;

  if (!reviewId || !['pending', 'confirmed_duplicate', 'different_people', 'merged'].includes(status)) {
    return NextResponse.json({ error: 'reviewId and valid status are required' }, { status: 400 });
  }

  const review = await updateDuplicateReview({
    reviewId,
    status: status as 'pending' | 'confirmed_duplicate' | 'different_people' | 'merged',
    reviewedById: session.user.id,
    notes,
  });

  return NextResponse.json({ review });
}
