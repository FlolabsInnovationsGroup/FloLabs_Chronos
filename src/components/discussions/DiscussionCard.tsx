'use client';

import { useCallback, useState } from 'react';
import { useSSE } from '@/hooks/use-sse';
import { Tooltip } from '@/components/ui/Tooltip';
import type { EntryDiscussion, SSEEvent } from '@/types';

interface DiscussionCardProps {
  initialDiscussions: EntryDiscussion[];
  viewerRole: string;
  viewerId: string;
}

function relativeDate(date: Date): string {
  const d = new Date(date);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffMs = todayStart.getTime() - dStart.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays <= 6) return `${diffDays} days ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function DiscussionCard({ initialDiscussions, viewerRole, viewerId }: DiscussionCardProps) {
  const [discussions, setDiscussions] = useState<EntryDiscussion[]>(initialDiscussions);
  const [expanded, setExpanded] = useState(false);
  const [resolvingIds, setResolvingIds] = useState<Set<string>>(new Set());

  const unresolvedCount = discussions.filter((d) => d.resolvedAt === null).length;

  const refetch = useCallback(async () => {
    try {
      const res = await fetch('/api/discussions');
      if (res.ok) {
        const data = await res.json();
        setDiscussions(data.discussions ?? []);
      }
    } catch {
      // ignore
    }
  }, []);

  useSSE(
    useCallback(
      (event: SSEEvent) => {
        if (event.type === 'discussion:new' || event.type === 'discussion:resolved') {
          void refetch();
        }
      },
      [refetch]
    )
  );

  async function handleResolve(discussion: EntryDiscussion) {
    setResolvingIds((prev) => new Set(prev).add(discussion.id));
    try {
      const res = await fetch(`/api/discussions/${discussion.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolved: true }),
      });
      if (res.ok) {
        setDiscussions((prev) => prev.filter((d) => d.id !== discussion.id));
      }
    } finally {
      setResolvingIds((prev) => {
        const next = new Set(prev);
        next.delete(discussion.id);
        return next;
      });
    }
  }

  if (discussions.length === 0) return null;

  const canResolve = (discussion: EntryDiscussion) =>
    viewerRole === 'admin' || discussion.startedById === viewerId;

  return (
    <div className="bg-surface-container-lowest rounded-xl paper-shadow">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4">
        <span
          className="text-sm font-semibold text-on-background"
          style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
        >
          Discussions
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex items-center justify-center min-w-[1.5rem] h-6 px-2 rounded-full bg-primary text-on-primary text-xs font-semibold tabular-nums"
            style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
            aria-label={`${unresolvedCount} unresolved discussions`}
          >
            {unresolvedCount}
          </button>
          <Tooltip label="Discussions started on time entries that need your attention" delayMs={0}>
            <span className="material-symbols-outlined text-on-surface-variant cursor-default" style={{ fontSize: '16px' }}>
              info
            </span>
          </Tooltip>
        </div>
      </div>

      {/* Collapsible list */}
      {expanded && (
        <div className="flex flex-col divide-y divide-surface-container-low border-t border-surface-container-low">
          {discussions.map((discussion) => (
            <div key={discussion.id} className="px-5 py-3.5 flex flex-col gap-1.5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                  <p
                    className="text-sm italic text-on-background truncate"
                    style={{ fontFamily: "var(--font-newsreader, 'Newsreader'), serif" }}
                  >
                    {discussion.entryDescription || 'No description'}
                  </p>
                  {discussion.entryProjectName && (
                    <span
                      className="text-xs text-primary font-medium"
                      style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                    >
                      {discussion.entryProjectName}
                    </span>
                  )}
                </div>
                {canResolve(discussion) && (
                  <button
                    type="button"
                    onClick={() => handleResolve(discussion)}
                    disabled={resolvingIds.has(discussion.id)}
                    className="shrink-0 text-xs px-2.5 py-1 rounded-lg border border-surface-container-highest text-on-surface-variant hover:bg-surface-container-low transition-colors disabled:opacity-50"
                    style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                  >
                    Resolve
                  </button>
                )}
              </div>
              <p
                className="text-sm text-on-background"
                style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
              >
                {discussion.message}
              </p>
              <p
                className="text-xs text-outline-variant"
                style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
              >
                by {discussion.startedBy?.name ?? 'Unknown'} · {relativeDate(discussion.createdAt)}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
