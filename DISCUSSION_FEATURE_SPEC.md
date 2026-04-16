# Entry Discussions Feature — Implementation Spec

Read CLAUDE.md, ARCHITECTURE.md, and GAME_MASTER.md first for full context.

---

## Overview

Build a full entry-discussion (chat) feature so admins and team leads can flag time entries that need discussion. Members see discussions on their own entries. Resolved discussions are hidden from the dashboard card.

---

## 1. Database Schema

Add to `src/lib/db/schema.ts`:

```ts
export const entryDiscussions = pgTable(
  'entry_discussions',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    entryId: uuid('entry_id').notNull().references(() => timeEntries.id, { onDelete: 'cascade' }),
    startedById: uuid('started_by_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    message: text('message').notNull(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    resolvedById: uuid('resolved_by_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index('idx_discussions_entry').on(t.entryId),
    index('idx_discussions_started_by').on(t.startedById),
    index('idx_discussions_unresolved').on(t.entryId, t.resolvedAt),
  ]
);

export type EntryDiscussionRecord = typeof entryDiscussions.$inferSelect;
export type NewEntryDiscussion = typeof entryDiscussions.$inferInsert;
```

Write migration script `scripts/migrate-entry-discussions.ts` — creates the table using raw SQL via `postgres` package (same pattern as other migration scripts). Load `.env.local` with dotenv.

Add to package.json scripts: `"db:migrate:entry-discussions": "tsx scripts/migrate-entry-discussions.ts"`

---

## 2. TypeScript types — `src/types/index.ts`

Add interface:

```ts
export interface EntryDiscussion {
  id: string;
  entryId: string;
  startedById: string;
  message: string;
  resolvedAt: Date | null;
  resolvedById: string | null;
  createdAt: Date;
  updatedAt: Date;
  startedBy?: Pick<User, 'id' | 'name'>;
  resolvedBy?: Pick<User, 'id' | 'name'> | null;
  entryOwnerUserId?: string;
  entryDescription?: string;
  entryProjectName?: string;
}
```

Extend SSEEvent type: add `'discussion:new' | 'discussion:resolved'` to the type union.

---

## 3. Access control — `src/lib/permissions.ts`

Add these helpers:

```ts
/** Admins and team leads can discuss entries of OTHER users they can see. Not own entries. */
export async function canStartDiscussion(viewer: SessionUserLike, entryOwnerUserId: string): Promise<boolean> {
  if (viewer.id === entryOwnerUserId) return false;
  if (isAdmin(viewer)) return true;
  if (isTeamLead(viewer)) return canAccessUser(viewer, entryOwnerUserId);
  return false;
}

/** Admins can resolve any discussion. Discussion starter can resolve their own. */
export function canResolveDiscussion(
  viewer: SessionUserLike,
  discussion: { startedById: string }
): boolean {
  if (isAdmin(viewer)) return true;
  return viewer.id === discussion.startedById;
}

/** Who can view discussions on an entry */
export async function canViewDiscussions(viewer: SessionUserLike, entryOwnerUserId: string): Promise<boolean> {
  if (isAdmin(viewer)) return true;
  if (isTeamLead(viewer)) return canAccessUser(viewer, entryOwnerUserId);
  return viewer.id === entryOwnerUserId;
}
```

---

## 4. Realtime — `src/lib/realtime.ts`

Add a `discussionBroadcaster` EventEmitter alongside `dataBroadcaster`, and export a `broadcastDiscussionChange(entryId: string)` helper that emits `{ type: 'discussion:new', channel: 'discussions', entryId }`.

---

## 5. SSE route — `src/app/api/sse/route.ts`

Subscribe to `discussionBroadcaster` events alongside existing timer/data broadcasters, and forward them to connected clients.

---

## 6. API routes

### `src/app/api/discussions/route.ts` — GET (list unresolved) + POST (start)

**GET**: Returns unresolved discussions for the current viewer:
- Admin: ALL unresolved (resolvedAt IS NULL)
- Team Lead: unresolved where startedById = viewer.id OR entry.userId is in accessible user ids
- Member: unresolved on their own entries (entry.userId = viewer.id)
- Join: startedBy name, entry description, entry project name, entry owner userId/name
- Return: `{ discussions: EntryDiscussion[] }`

**POST**: body `{ entryId: string, message: string }`
- Load entry from DB; check canStartDiscussion(viewer, entry.userId)
- Insert discussion
- broadcastDiscussionChange(entryId)
- Return `{ discussion: EntryDiscussion }`

### `src/app/api/discussions/entry/[entryId]/route.ts` — GET

- Auth required
- Load entry; check canViewDiscussions(viewer, entry.userId)
- Return all discussions for that entry ordered by createdAt asc (both resolved and unresolved)
- Join startedBy name and resolvedBy name
- Return `{ discussions: EntryDiscussion[] }`

### `src/app/api/discussions/[id]/route.ts` — PATCH (resolve) + DELETE

**PATCH**: body `{ resolved: true }`
- Load discussion; check canResolveDiscussion(viewer, discussion)
- Set resolvedAt = now(), resolvedById = viewer.id, updatedAt = now()
- broadcastDiscussionChange(discussion.entryId)
- Return `{ discussion: EntryDiscussion }`

**DELETE**: 
- Admin can always delete; starter can delete if resolvedAt IS NULL
- Hard delete
- broadcastDiscussionChange(discussion.entryId)
- Return `{ ok: true }`

---

## 7. EntryCard — add chat icon

File: `src/components/entries/EntryCard.tsx`

Add optional props:
- `onDiscuss?: (entry: TimeEntry) => void`
- `viewerRole?: string`
- `viewerId?: string`

In the action icons area (beside edit and delete buttons), add a chat button:
- Only render when: `onDiscuss` is provided AND `viewerRole` is 'admin' or 'team_lead' AND `entry.userId !== viewerId`
- Icon: `chat_bubble` (material-symbols-outlined)
- Classes: `p-1.5 rounded-lg text-primary hover:bg-primary-container transition-all duration-150`
- Same opacity-on-hover behavior as other action buttons
- Tooltip label: "Start discussion"
- On click: call `onDiscuss(entry)`

---

## 8. EntryList — thread props through

File: `src/components/entries/EntryList.tsx`

Add optional props `onDiscuss`, `viewerRole`, `viewerId` — pass them to each `EntryCard` render call.

---

## 9. ReportEntries — wire up discussion modal

File: `src/components/reports/ReportEntries.tsx`

Add props: `viewerRole?: string`, `viewerId?: string`

Add state:
- `discussEntry: TimeEntry | null` 
- `discussOpen: boolean`
- `discussMsg: string`
- `discussLoading: boolean`
- `discussError: string`
- `discussSuccess: boolean`

Pass `onDiscuss={(entry) => { setDiscussEntry(entry); setDiscussMsg(''); setDiscussOpen(true); }}`, `viewerRole`, `viewerId` to EntryList.

When discussOpen:
- render a Modal (size='md', title='Start discussion') with:
  - small entry header: `{discussEntry?.description}` in italic + project badge
  - textarea for message (required, min 1 char, rows=3)
  - error display if discussError
  - Cancel + Submit buttons
  - on submit: POST /api/discussions, on success close modal and show brief success message for 2s

---

## 10. Reports page — pass viewer info

File: `src/app/(dashboard)/reports/page.tsx`

Pass `viewerRole={session.user.role}` and `viewerId={session.user.id}` to `<ReportEntries>`.

---

## 11. DiscussionCard component

Create `src/components/discussions/DiscussionCard.tsx`:

```
'use client'
Props: initialDiscussions: EntryDiscussion[], viewerRole: string, viewerId: string

- if initialDiscussions is empty, return null (don't render)
- Card with header row:
  - left: 'Discussions' title (Work Sans, font-semibold, text-on-background)
  - right: clickable count badge (number of unresolved, primary color) that toggles the list expanded/collapsed
  - next to badge: info icon button (info, material-symbols-outlined) wrapped in Tooltip with delayMs=0, label='Discussions started on time entries that need your attention'
- collapsible list (default collapsed):
  - each discussion shows:
    - entry description (truncated, italic Newsreader) + project name badge
    - message text (Work Sans, text-sm, text-on-background)
    - 'by {startedBy.name} · {relative date}' (text-xs, text-outline-variant)
    - Resolve button (only if canResolveDiscussion logic: admin always, startedById === viewerId):
      - small button, variant ghost or secondary
      - calls PATCH /api/discussions/[id] with { resolved: true }
      - on success: remove from local list
- subscribes to SSE events discussion:new and discussion:resolved, re-fetches /api/discussions on those events
- uses useSSE hook
- helper for relative date: 'Today', 'Yesterday', 'N days ago' (up to 6), else 'MMM D'
```

The card should use Vellum Ink tokens (bg-surface-container-lowest, paper-shadow, etc.) and match the visual style of ActiveTimerCard/Weekly Momentum.

---

## 12. Timer dashboard — wire DiscussionCard in

File: `src/components/timer/TimerDashboardClient.tsx`

- Import DiscussionCard
- Add prop: `initialDiscussions: EntryDiscussion[]`
- In the grid layout, render DiscussionCard ABOVE the Weekly Momentum card (inside the right column, before ActiveTimerCard):
  ```tsx
  <DiscussionCard initialDiscussions={initialDiscussions} viewerRole={session.user.role} viewerId={session.user.id} />
  <ActiveTimerCard weekEntries={weekEntries} weeklyTargetHours={weeklyTargetHours} />
  ```
- Get session: add `const { data: session } = useSession()` if not already present (it is)

File: `src/app/(dashboard)/timer/page.tsx`

- Add a server-side query to fetch unresolved discussions for the current user (replicate the GET /api/discussions logic inline, or call it as a fetch — prefer inline DB query for SSR performance)
- Pass as `initialDiscussions` to TimerDashboardClient

---

## 13. Run migration

After writing all files:
```
pnpm run db:migrate:entry-discussions
```

---

## 14. Build verification

```
pnpm exec tsc --noEmit
pnpm build
```

Fix ALL TypeScript and build errors before finishing.

---

## 15. Update GAME_MASTER.md and ARCHITECTURE.md

GAME_MASTER.md: mark feature complete, note live-timer chat was intentionally skipped (active timers are Redis-only until stopped, no stable entry id).

ARCHITECTURE.md: add entry_discussions table to data model DDL section. Add access rules paragraph.

---

## 16. Commit and push

```
git add -A
git commit -m "feat: entry discussions — start/resolve discussions on time entries"
git push
```

Then:
```
openclaw system event --text "Done: Entry discussions feature built and pushed" --mode now
```
