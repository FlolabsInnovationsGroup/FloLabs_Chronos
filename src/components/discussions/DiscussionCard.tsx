'use client';

import { useCallback, useState } from 'react';
import { useSSE } from '@/hooks/use-sse';
import { Tooltip } from '@/components/ui/Tooltip';
import type { EntryDiscussion, DiscussionReply, SSEEvent } from '@/types';

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

function avatarColor(name: string): string {
  const colors = [
    'bg-primary-container text-on-primary-fixed',
    'bg-secondary-fixed text-on-secondary-fixed',
    'bg-tertiary-container text-on-tertiary-fixed',
  ];
  return colors[(name.charCodeAt(0) ?? 0) % 3];
}

interface MessageRowProps {
  name: string;
  date: Date;
  message: string;
}

function MessageRow({ name, date, message }: MessageRowProps) {
  const initials = name.slice(0, 1).toUpperCase();
  return (
    <div className="flex items-start gap-2.5">
      <div
        className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold ${avatarColor(name)}`}
        style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
      >
        {initials}
      </div>
      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span
            className="text-xs font-medium text-on-surface-variant"
            style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
          >
            {name}
          </span>
          <span
            className="text-xs text-outline-variant"
            style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
          >
            · {relativeDate(date)}
          </span>
        </div>
        <p
          className="text-sm text-on-background"
          style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
        >
          {message}
        </p>
      </div>
    </div>
  );
}

export function DiscussionCard({ initialDiscussions, viewerRole, viewerId }: DiscussionCardProps) {
  const [discussions, setDiscussions] = useState<EntryDiscussion[]>(initialDiscussions);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [allExpanded, setAllExpanded] = useState(false);
  const [resolvingIds, setResolvingIds] = useState<Set<string>>(new Set());
  const [replyTexts, setReplyTexts] = useState<Record<string, string>>({});
  const [replyLoading, setReplyLoading] = useState<Record<string, boolean>>({});

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

  function toggleAllExpanded() {
    const next = !allExpanded;
    setAllExpanded(next);
    if (next) {
      setExpandedIds(new Set(discussions.map((d) => d.id)));
    } else {
      setExpandedIds(new Set());
    }
  }

  function toggleExpanded(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

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

  async function handleReply(discussion: EntryDiscussion) {
    const msg = (replyTexts[discussion.id] ?? '').trim();
    if (!msg) return;
    setReplyLoading((prev) => ({ ...prev, [discussion.id]: true }));
    try {
      const res = await fetch(`/api/discussions/${discussion.id}/replies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg }),
      });
      if (res.ok) {
        const { reply } = await res.json() as { reply: DiscussionReply };
        setDiscussions((prev) =>
          prev.map((d) =>
            d.id === discussion.id
              ? { ...d, replies: [...(d.replies ?? []), reply] }
              : d
          )
        );
        setReplyTexts((prev) => ({ ...prev, [discussion.id]: '' }));
      }
    } finally {
      setReplyLoading((prev) => ({ ...prev, [discussion.id]: false }));
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
            onClick={toggleAllExpanded}
            className="inline-flex items-center justify-center min-w-[1.5rem] h-6 px-2 rounded-full bg-primary text-on-primary text-xs font-semibold tabular-nums"
            style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
            aria-label={`${unresolvedCount} unresolved discussions, click to ${allExpanded ? 'collapse' : 'expand'} all`}
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

      {/* Discussion list */}
      <div className="flex flex-col divide-y divide-surface-container-low border-t border-surface-container-low">
        {discussions.map((discussion) => {
          const isExpanded = expandedIds.has(discussion.id);
          const replies: DiscussionReply[] = discussion.replies ?? [];
          return (
            <div key={discussion.id} className="flex flex-col">
              {/* Collapsed header row — click to expand */}
              <button
                type="button"
                className="flex items-start justify-between gap-2 px-5 py-3.5 text-left w-full hover:bg-surface-container-low transition-colors"
                onClick={() => toggleExpanded(discussion.id)}
              >
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
                  {!isExpanded && (
                    <p
                      className="text-xs text-outline-variant truncate"
                      style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                    >
                      {discussion.message}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {replies.length > 0 && (
                    <span
                      className="text-xs text-outline-variant tabular-nums"
                      style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                    >
                      {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
                    </span>
                  )}
                  {canResolve(discussion) && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); void handleResolve(discussion); }}
                      disabled={resolvingIds.has(discussion.id)}
                      className="text-xs px-2.5 py-1 rounded-lg border border-surface-container-highest text-on-surface-variant hover:bg-surface-container-low transition-colors disabled:opacity-50"
                      style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                    >
                      Resolve
                    </button>
                  )}
                  <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: '16px' }}>
                    {isExpanded ? 'expand_less' : 'expand_more'}
                  </span>
                </div>
              </button>

              {/* Expanded thread */}
              {isExpanded && (
                <div className="px-5 pb-4 flex flex-col gap-3">
                  {/* Opening message */}
                  <MessageRow
                    name={discussion.startedBy?.name ?? 'Unknown'}
                    date={discussion.createdAt}
                    message={discussion.message}
                  />

                  {/* Replies */}
                  {replies.map((reply) => (
                    <MessageRow
                      key={reply.id}
                      name={reply.author?.name ?? 'Unknown'}
                      date={reply.createdAt}
                      message={reply.message}
                    />
                  ))}

                  {/* Reply form */}
                  <div className="flex flex-col gap-2 pt-1 border-t border-surface-container-low">
                    <textarea
                      value={replyTexts[discussion.id] ?? ''}
                      onChange={(e) =>
                        setReplyTexts((prev) => ({ ...prev, [discussion.id]: e.target.value }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                          void handleReply(discussion);
                        }
                      }}
                      placeholder="Reply…"
                      rows={2}
                      className="resize-none rounded-lg border border-surface-container-highest bg-background text-sm text-on-background placeholder:text-outline-variant px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40"
                      style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                    />
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => void handleReply(discussion)}
                        disabled={replyLoading[discussion.id] || !(replyTexts[discussion.id] ?? '').trim()}
                        className="bg-primary text-on-primary rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50 hover:opacity-90 transition-opacity"
                        style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                      >
                        {replyLoading[discussion.id] ? 'Sending…' : 'Send'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
