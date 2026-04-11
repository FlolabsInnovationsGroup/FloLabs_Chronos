'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSSE } from '@/hooks/use-sse';
import { Tooltip } from '@/components/ui/Tooltip';
import type { EntryDiscussion, DiscussionReply, SSEEvent } from '@/types';

// ─── helpers ────────────────────────────────────────────────────────────────

function relativeDate(date: Date): string {
  const d = new Date(date);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((todayStart.getTime() - dStart.getTime()) / (1000 * 60 * 60 * 24));
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

// ─── types ───────────────────────────────────────────────────────────────────

interface DiscussionCardProps {
  initialDiscussions: EntryDiscussion[];
  viewerRole: string;
  viewerId: string;
}

// ─── sub-components ──────────────────────────────────────────────────────────

interface MessageRowProps {
  name: string;
  date: Date;
  message: string;
  isLive?: boolean;
}

function MessageRow({ name, date, message, isLive }: MessageRowProps) {
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
          {isLive && (
            <span
              className="inline-block w-2 h-2 rounded-full bg-error shrink-0"
              title="Online now"
              aria-label="Online"
            />
          )}
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

// ─── presence hook ────────────────────────────────────────────────────────────

function useOnlineUserIds(): Set<string> {
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    async function fetch_() {
      try {
        const res = await fetch('/api/users', { cache: 'no-store' });
        if (!res.ok || cancelled) return;
        const data = await res.json() as { users?: { id: string; activeTimer: unknown | null }[] };
        const live = new Set<string>(
          (data.users ?? [])
            .filter((u) => u.activeTimer !== null)
            .map((u) => u.id)
        );
        if (!cancelled) setOnlineIds(live);
      } catch { /* ignore */ }
    }
    void fetch_();
    const interval = setInterval(() => void fetch_(), 30_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  return onlineIds;
}

// ─── unread tracking (localStorage) ─────────────────────────────────────────

const SEEN_KEY = 'chronos:seen_discussion_reply_ids';

function getSeenIds(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch { return new Set(); }
}

function markSeen(ids: string[]) {
  try {
    const existing = getSeenIds();
    for (const id of ids) existing.add(id);
    // Keep only last 500 to avoid unbounded growth
    const arr = [...existing].slice(-500);
    localStorage.setItem(SEEN_KEY, JSON.stringify(arr));
  } catch { /* ignore */ }
}

function hasUnread(discussion: EntryDiscussion, seen: Set<string>): boolean {
  if (!discussion.replies?.length) return false;
  return discussion.replies.some((r) => !seen.has(r.id));
}

// ─── main component ───────────────────────────────────────────────────────────

export function DiscussionCard({ initialDiscussions, viewerRole, viewerId }: DiscussionCardProps) {
  const [discussions, setDiscussions] = useState<EntryDiscussion[]>(initialDiscussions);
  const [listOpen, setListOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [resolvingIds, setResolvingIds] = useState<Set<string>>(new Set());
  const [replyTexts, setReplyTexts] = useState<Record<string, string>>({});
  const [replyLoading, setReplyLoading] = useState<Record<string, boolean>>({});
  const [seenIds, setSeenIds] = useState<Set<string>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const onlineIds = useOnlineUserIds();

  // Load seen IDs from localStorage once on mount
  useEffect(() => {
    setSeenIds(getSeenIds());
  }, []);

  // Auto-scroll to bottom of active discussion when new messages arrive
  useEffect(() => {
    if (activeId) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activeId, discussions]);

  // When opening a chat, mark all its replies as seen
  function openDiscussion(id: string) {
    setActiveId(id);
    setListOpen(false);
    const discussion = discussions.find((d) => d.id === id);
    if (discussion?.replies?.length) {
      const ids = discussion.replies.map((r) => r.id);
      markSeen(ids);
      setSeenIds((prev) => {
        const next = new Set(prev);
        for (const rid of ids) next.add(rid);
        return next;
      });
    }
  }

  const refetch = useCallback(async () => {
    try {
      const res = await fetch('/api/discussions');
      if (res.ok) {
        const data = await res.json() as { discussions?: EntryDiscussion[] };
        const updated = data.discussions ?? [];
        setDiscussions(updated);
        // If actively viewing a chat, mark newly arrived replies as seen
        if (activeId) {
          const active = updated.find((d) => d.id === activeId);
          if (active?.replies?.length) {
            const ids = active.replies.map((r) => r.id);
            markSeen(ids);
            setSeenIds((prev) => {
              const next = new Set(prev);
              for (const rid of ids) next.add(rid);
              return next;
            });
          }
        }
      }
    } catch { /* ignore */ }
  }, [activeId]);

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
        if (activeId === discussion.id) setActiveId(null);
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
        // Mark the reply we just sent as seen
        markSeen([reply.id]);
        setSeenIds((prev) => new Set(prev).add(reply.id));
      }
    } finally {
      setReplyLoading((prev) => ({ ...prev, [discussion.id]: false }));
    }
  }

  const unresolvedCount = discussions.filter((d) => d.resolvedAt === null).length;
  const hasAnyUnread = discussions.some((d) => hasUnread(d, seenIds));

  const canResolve = (discussion: EntryDiscussion) =>
    viewerRole === 'admin' || discussion.startedById === viewerId;

  const activeDiscussion = activeId ? discussions.find((d) => d.id === activeId) : null;

  if (discussions.length === 0 && !activeId) return null;

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
          <Tooltip
            label={`${unresolvedCount} unresolved · click to ${listOpen ? 'hide' : 'show'} list`}
            delayMs={0}
          >
            <button
              type="button"
              onClick={() => { setListOpen((v) => !v); setActiveId(null); }}
              className={`inline-flex items-center justify-center min-w-[1.5rem] h-6 px-2 rounded-full text-xs font-semibold tabular-nums transition-colors ${
                hasAnyUnread
                  ? 'bg-error text-on-error'
                  : 'bg-primary text-on-primary'
              }`}
              style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
              aria-label={`${unresolvedCount} unresolved discussions`}
              aria-pressed={listOpen}
            >
              {unresolvedCount}
            </button>
          </Tooltip>
          <Tooltip label="Discussions on time entries that need attention" delayMs={0}>
            <span className="material-symbols-outlined text-on-surface-variant cursor-default" style={{ fontSize: '16px' }}>
              info
            </span>
          </Tooltip>
        </div>
      </div>

      {/* Discussion list (shown only when badge clicked) */}
      {listOpen && !activeDiscussion && (
        <div className="flex flex-col divide-y divide-surface-container-low border-t border-surface-container-low">
          {discussions.length === 0 ? (
            <p
              className="px-5 py-4 text-sm text-outline-variant"
              style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
            >
              No unresolved discussions.
            </p>
          ) : (
            discussions.map((discussion) => {
              const replies: DiscussionReply[] = discussion.replies ?? [];
              const unread = hasUnread(discussion, seenIds);
              return (
                <button
                  key={discussion.id}
                  type="button"
                  className="flex items-start justify-between gap-2 px-5 py-3.5 text-left w-full hover:bg-surface-container-low transition-colors"
                  onClick={() => openDiscussion(discussion.id)}
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
                    <p
                      className="text-xs text-outline-variant truncate"
                      style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                    >
                      {discussion.message}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {unread && (
                      <span className="inline-block w-2 h-2 rounded-full bg-error shrink-0" aria-label="Unread messages" />
                    )}
                    {replies.length > 0 && (
                      <span
                        className="text-xs text-outline-variant tabular-nums"
                        style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                      >
                        {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
                      </span>
                    )}
                    <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: '16px' }}>
                      chevron_right
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      )}

      {/* Active chat thread */}
      {activeDiscussion && (
        <div className="flex flex-col border-t border-surface-container-low">
          {/* Chat header */}
          <div className="flex items-center gap-2 px-5 py-3 border-b border-surface-container-low">
            <button
              type="button"
              onClick={() => { setActiveId(null); setListOpen(true); }}
              className="p-0.5 rounded text-on-surface-variant hover:bg-surface-container-low transition-colors"
              aria-label="Back to list"
            >
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>arrow_back</span>
            </button>
            <div className="flex flex-col min-w-0 flex-1">
              <p
                className="text-sm italic text-on-background truncate"
                style={{ fontFamily: "var(--font-newsreader, 'Newsreader'), serif" }}
              >
                {activeDiscussion.entryDescription || 'No description'}
              </p>
              {activeDiscussion.entryProjectName && (
                <span
                  className="text-xs text-primary font-medium"
                  style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                >
                  {activeDiscussion.entryProjectName}
                </span>
              )}
            </div>
            {canResolve(activeDiscussion) && (
              <button
                type="button"
                onClick={() => void handleResolve(activeDiscussion)}
                disabled={resolvingIds.has(activeDiscussion.id)}
                className="text-xs px-2.5 py-1 rounded-lg border border-surface-container-highest text-on-surface-variant hover:bg-surface-container-low transition-colors disabled:opacity-50 shrink-0"
                style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
              >
                Resolve
              </button>
            )}
          </div>

          {/* Messages */}
          <div className="flex flex-col gap-3 px-5 py-4 max-h-72 overflow-y-auto">
            {/* Opening message */}
            <MessageRow
              name={activeDiscussion.startedBy?.name ?? 'Unknown'}
              date={activeDiscussion.createdAt}
              message={activeDiscussion.message}
              isLive={onlineIds.has(activeDiscussion.startedById)}
            />

            {/* Replies */}
            {(activeDiscussion.replies ?? []).map((reply) => (
              <MessageRow
                key={reply.id}
                name={reply.author?.name ?? 'Unknown'}
                date={reply.createdAt}
                message={reply.message}
                isLive={onlineIds.has(reply.authorId)}
              />
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Reply form */}
          <div className="flex flex-col gap-2 px-5 pb-4 pt-1 border-t border-surface-container-low">
            <textarea
              value={replyTexts[activeDiscussion.id] ?? ''}
              onChange={(e) =>
                setReplyTexts((prev) => ({ ...prev, [activeDiscussion.id]: e.target.value }))
              }
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  void handleReply(activeDiscussion);
                }
              }}
              placeholder="Reply… (⌘↵ to send)"
              rows={2}
              className="resize-none rounded-lg border border-surface-container-highest bg-background text-sm text-on-background placeholder:text-outline-variant px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40"
              style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
            />
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => void handleReply(activeDiscussion)}
                disabled={replyLoading[activeDiscussion.id] || !(replyTexts[activeDiscussion.id] ?? '').trim()}
                className="bg-primary text-on-primary rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50 hover:opacity-90 transition-opacity"
                style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
              >
                {replyLoading[activeDiscussion.id] ? 'Sending…' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
