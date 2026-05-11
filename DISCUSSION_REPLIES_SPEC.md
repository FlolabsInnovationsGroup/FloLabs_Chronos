# Discussion Replies — Implementation Spec

**STATUS: IMPLEMENTED ✅** — This feature is complete and deployed. The spec below is preserved as a historical reference.

Read CLAUDE.md first. This builds on top of the existing entry discussions feature.

---

## Goal

Allow users to reply to discussions so the full conversation is visible on the card. Any party who can see a discussion can reply to it: the entry owner, the discussion starter, and any admin or team lead in scope.

---

## 1. Schema — new table `discussion_replies`

Add to `src/lib/db/schema.ts`:

```ts
export const discussionReplies = pgTable(
  'discussion_replies',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    discussionId: uuid('discussion_id').notNull().references(() => entryDiscussions.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    message: text('message').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index('idx_replies_discussion').on(t.discussionId),
    index('idx_replies_author').on(t.authorId),
  ]
);

export type DiscussionReplyRecord = typeof discussionReplies.$inferSelect;
export type NewDiscussionReply = typeof discussionReplies.$inferInsert;
```

Migration script: `scripts/migrate-discussion-replies.ts` — creates the table using raw SQL via `postgres` package (same pattern as existing migration scripts: load `.env.local` with dotenv, connect via DATABASE_URL, run CREATE TABLE IF NOT EXISTS).

Add to package.json scripts: `"db:migrate:discussion-replies": "tsx scripts/migrate-discussion-replies.ts"`

---

## 2. TypeScript types — `src/types/index.ts`

Add:

```ts
export interface DiscussionReply {
  id: string;
  discussionId: string;
  authorId: string;
  message: string;
  createdAt: Date;
  updatedAt: Date;
  author?: Pick<User, 'id' | 'name'>;
}
```

Also update `EntryDiscussion` interface to include an optional `replies?: DiscussionReply[]` field.

---

## 3. API — `src/app/api/discussions/[id]/replies/route.ts`

### GET — list replies for a discussion
- Auth required
- Load the discussion, then the entry to check canViewDiscussions(viewer, entry.userId)
- Return all replies ordered by createdAt asc, joined with author name
- Return `{ replies: DiscussionReply[] }`

### POST — add a reply
- Body: `{ message: string }` (min 1 char, Zod validate)
- Auth required
- Load the discussion + entry; check canViewDiscussions(viewer, entry.userId) — anyone who can see the discussion can reply
- Insert reply
- broadcastDiscussionChange(discussion.entryId)  [reuse existing function]
- Return `{ reply: DiscussionReply }` with 201

---

## 4. Update GET /api/discussions to include replies

In `src/app/api/discussions/route.ts`, after fetching rows, also fetch replies for each discussion and attach them.

Specifically: collect all discussion ids from rows, do a single query of `discussion_replies` where `discussion_id IN (ids)`, join author name, group by discussionId, attach to each discussion as `replies`.

---

## 5. Update GET /api/discussions/entry/[entryId]/route.ts

Same as above — after building the discussions array, attach replies to each discussion.

---

## 6. Update `DiscussionCard.tsx` — show full thread + reply form

Significant rewrite of `src/components/discussions/DiscussionCard.tsx`:

### Structure per discussion item:

```
[Entry description] [Project badge]   [Resolve button if authorized]
────────────────────────────────────────────────
  [startedBy.name avatar-initial] [startedBy.name] · [relativeDate]
  "[opening message]"
  
  [reply1.author.name avatar-initial] [reply1.author.name] · [relativeDate]
  "[reply1.message]"
  
  [reply2...] 
  
  ── Reply ──────────────────────────────────────
  [textarea, placeholder="Reply…", rows=2]
  [Send button]
```

### Design details:
- Each message (opening + replies) is shown as a compact chat bubble row:
  - Small colored initial-avatar circle (use a deterministic color from name hash — pick one of: primary-container, secondary-fixed, tertiary-container based on name charCode % 3)
  - Author name in font-medium text-xs text-on-surface-variant + Work Sans
  - Relative date in text-xs text-outline-variant
  - Message text in text-sm text-on-background Work Sans
- Reply form at the bottom of each expanded discussion (always visible when discussion is expanded)
- "Send" button: small, variant primary-like (bg-primary text-on-primary rounded-lg px-3 py-1.5 text-xs)
- Textarea: resize-none, rounded-lg border border-surface-container-highest bg-background text-sm, focus ring
- Submitting reply: POST /api/discussions/[id]/replies, then add the new reply to local state immediately (optimistic), also triggers SSE refetch

### Expansion behavior:
- Each discussion in the list is individually expandable (click anywhere on the header row to expand)
- Default: all collapsed (just shows entry title, message preview truncated, Resolve button)
- When expanded: shows full thread + reply form
- The count badge in the card header still toggles all-expanded/all-collapsed (open all vs close all)

### State shape:
```ts
const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
const [replyTexts, setReplyTexts] = useState<Record<string, string>>({});
const [replyLoading, setReplyLoading] = useState<Record<string, boolean>>({});
```

### Sending a reply:
```ts
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
      const { reply } = await res.json();
      // Add reply to local discussion
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
```

### Avatar helper:
```ts
function avatarColor(name: string): string {
  const colors = ['bg-primary-container text-on-primary-fixed', 'bg-secondary-fixed text-on-secondary-fixed', 'bg-tertiary-container text-on-tertiary-fixed'];
  return colors[(name.charCodeAt(0) ?? 0) % 3];
}
```

---

## 7. Run migration

After writing all files:
```
pnpm run db:migrate:discussion-replies
```

---

## 8. Build verification

```
pnpm exec tsc --noEmit
pnpm build
```

Fix ALL TypeScript errors.

---

## 9. Update GAME_MASTER.md

Note that discussion replies were added (any visible party can reply to a discussion thread).

---

## 10. Commit and push

```
git add -A
git commit -m "feat: discussion replies — full thread view and reply form on dashboard card"
git push
```

Then:
```
openclaw system event --text "Done: Discussion replies built and pushed" --mode now
```
