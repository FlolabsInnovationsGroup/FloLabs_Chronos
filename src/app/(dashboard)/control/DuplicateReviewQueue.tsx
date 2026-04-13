'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

type Review = {
  id: string;
  status: string;
  confidenceScore?: number;
  confidence_score?: number;
  reasons?: string[];
  primaryApplicantId?: string;
  duplicateApplicantId?: string;
  primaryApplicant?: { id?: string; name?: string; email?: string } | null;
  duplicateApplicant?: { id?: string; name?: string; email?: string } | null;
  canonicalApplicantId?: string | null;
};

export function DuplicateReviewQueue() {
  const [status, setStatus] = useState('pending');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);

  async function load(nextStatus = status) {
    setLoading(true);
    const res = await fetch(`/api/applicants/duplicate-reviews?status=${encodeURIComponent(nextStatus)}`, { cache: 'no-store', method: 'PUT' });
    const data = await res.json().catch(() => ({ reviews: [] }));
    setReviews(data.reviews ?? []);
    setLoading(false);
  }

  async function syncNow() {
    setSyncing(true);
    await fetch('/api/applicants/duplicate-reviews?sync=1', { method: 'PUT' });
    await load(status);
    setSyncing(false);
  }

  async function mergeWithCanonical(review: Review, canonicalApplicantId: string) {
    setSavingId(review.id);
    await fetch('/api/applicants/duplicate-reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reviewId: review.id, status: 'merged', canonicalApplicantId }),
    });
    await load(status);
    setSavingId(null);
  }

  useEffect(() => {
    void load(status);
  }, [status]);

  return (
    <Card className="p-6 flex flex-col gap-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-light italic text-on-background" style={{ fontFamily: "var(--font-newsreader, 'Newsreader'), serif" }}>Duplicate review queue</h2>
          <p className="text-sm text-on-surface-variant">Shared applicant duplicate decisions across Chronos and hephaestus.</p>
        </div>
        <div className="flex gap-2">
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-md border border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm">
            <option value="pending">Pending</option>
            <option value="confirmed_duplicate">Confirmed duplicate</option>
            <option value="different_people">Different people</option>
            <option value="merged">Merged</option>
          </select>
          <Button variant="secondary" onClick={() => void syncNow()} loading={syncing}>Sync pairs</Button>
        </div>
      </div>

      {loading ? <p className="text-sm text-on-surface-variant">Loading reviews…</p> : null}
      {!loading && reviews.length === 0 ? <p className="text-sm text-on-surface-variant">No reviews in this state.</p> : null}

      <div className="grid gap-3">
        {reviews.map((review) => (
          <div key={review.id} className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-on-background">{review.primaryApplicant?.name ?? 'Unknown applicant'} → {review.duplicateApplicant?.name ?? 'Unknown applicant'}</p>
                <p className="text-xs text-on-surface-variant">{review.primaryApplicant?.email ?? '—'} vs {review.duplicateApplicant?.email ?? '—'}</p>
              </div>
              <Badge color="secondary">score {review.confidenceScore ?? review.confidence_score ?? 0}</Badge>
            </div>
            <p className="mt-2 text-xs text-on-surface-variant">Signals: {(review.reasons ?? []).join(', ') || '—'}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="secondary"
                loading={savingId === review.id}
                onClick={() => void mergeWithCanonical(review, review.primaryApplicant?.id ?? review.primaryApplicantId ?? '')}
              >
                Merge into {review.primaryApplicant?.name ?? 'primary'}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                loading={savingId === review.id}
                onClick={() => void mergeWithCanonical(review, review.duplicateApplicant?.id ?? review.duplicateApplicantId ?? '')}
              >
                Merge into {review.duplicateApplicant?.name ?? 'duplicate'}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
