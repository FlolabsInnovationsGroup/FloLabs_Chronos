# QA Checklist — FloLabs Chronos

Production: **`https://athensgreecemarathon.com`** | App Runner: **`https://hcmsmnfq5q.us-east-1.awsapprunner.com`**

All E2E specs run Playwright against the live App Runner deployment. See `CLAUDE.md` for the deploy-and-test workflow.

Legend: **[AUTO]** = covered by an E2E spec · **[MANUAL]** = requires a human tester · **[BROWSER]** = verified interactively via browser session

---

## Timer — Start Session

<!--
Story: As a user I can start a timer with an optional description before any other fields are set.
Expected: POST /api/timer/start returns 200 { ok: true, timer: { userId, startedAt, ... } }.
  The page transitions from "Ready to Focus" to "Current Focus", the clock begins counting up,
  and the TopBar shows the elapsed time with a stop icon.
  The Weekly Momentum widget switches to "Live" badge and increments Sessions by 1.
  Stop Session button is disabled until a project AND description are both set.
-->

| Check | Coverage |
|---|---|
| Clicking "Start Session" POSTs to `/api/timer/start` and returns 200 with timer JSON | **[BROWSER]** verified 2026-06-01 |
| Page shows "Current Focus" heading and live clock after start | **[BROWSER]** verified 2026-06-01 |
| TopBar displays elapsed HH:MM:SS while running | **[AUTO]** `topbar-timer-duration.spec.ts` |
| Weekly Momentum shows "Live" badge and increments Sessions count | **[BROWSER]** verified 2026-06-01 |
| Stop Session button is **disabled** if description or project is missing | **[BROWSER]** verified 2026-06-01 |
| Hint text "Add a project and a description before stopping" shown when both missing | **[BROWSER]** verified 2026-06-01 |
| Hint text "Add a project before stopping" shown after description typed | **[BROWSER]** verified 2026-06-01 |

---

## Timer — Set Fields While Running

<!--
Story: As a user I can set/change description, project, Notion task, and tags on a running timer.
Expected: Each change fires PATCH /api/timer (200 OK), updating the Redis-backed timer state.
  The Active Project widget in Weekly Momentum updates immediately to the selected project name
  (not "No project") once a project is chosen. The Stop button enables once both project and
  description are present.
-->

| Check | Coverage |
|---|---|
| Typing in description field fires PATCH /api/timer (200 OK) | **[BROWSER]** verified 2026-06-01 |
| Selecting a project fires PATCH /api/timer and updates "Active Project" widget immediately | **[BROWSER]** verified 2026-06-01 — bug fixed: was reading from weekEntries instead of activeTimer.projectName |
| Searching Notion tasks fires GET /api/tasks?q= and shows results dropdown | **[BROWSER]** verified 2026-06-01 |
| Selecting a Notion task fires PATCH /api/timer (200 OK) | **[BROWSER]** verified 2026-06-01 |
| Typing in tags field shows existing tags + "Create" option | **[BROWSER]** verified 2026-06-01 |
| Creating a new tag fires POST /api/tags (201 Created), then PATCH /api/timer | **[BROWSER]** verified 2026-06-01 |
| Tag appears as chip in the tags field after selection | **[BROWSER]** verified 2026-06-01 |

---

## Timer — Stop Session & Data Retention

<!--
Story: As a user I stop a running timer and the resulting time entry retains all fields:
  description, project, Notion task, and tags. The entry appears in "Last 7 Days".
Expected: POST /api/timer/stop returns 200 { ok: true, durationMs: N }.
  The entry card shows description, project pill, Notion task link, tag chips, and duration.
  Weekly Momentum updates: Sessions stays, "Active Project" becomes "Last Project".
  Timer resets to "Ready to Focus" / 00:00:00.
-->

| Check | Coverage |
|---|---|
| Clicking "Stop Session" POSTs to `/api/timer/stop` and returns 200 | **[BROWSER]** verified 2026-06-01 |
| Stopped entry appears in "Last 7 Days" with correct description | **[BROWSER]** verified 2026-06-01 |
| Entry card shows project pill, Notion task link, and tag chips | **[BROWSER]** verified 2026-06-01 |
| Entry duration matches elapsed time | **[BROWSER]** verified 2026-06-01 |
| Weekly Momentum switches from "Active Project" to "Last Project" after stop | **[BROWSER]** verified 2026-06-01 |
| Timer resets to 00:00:00 and TopBar stop icon disappears | **[AUTO]** `topbar-timer-duration.spec.ts` |
| TopBar duration disappears immediately after stopping | **[AUTO]** `topbar-timer-duration.spec.ts` |

---

## Timer — TopBar Persistence Across Navigation

<!--
Story: As a user navigating between pages while a timer is running, the TopBar always shows
  the correct elapsed time and a stop control.
Expected: Navigating to /reports and back shows the same incrementing counter.
  The timer state is loaded from /api/timer/active on each page mount.
-->

| Check | Coverage |
|---|---|
| TopBar shows live HH:MM:SS while navigating to /reports | **[BROWSER]** verified 2026-06-01 |
| TopBar duration persists across page navigation | **[AUTO]** `topbar-timer-duration.spec.ts` |
| `/api/timer/active` returns `{ timer: { userId, startedAt, … } }` while running | **[AUTO]** `timer-recovery.spec.ts` |
| `/api/timer/active` returns `{ timer: null }` after stop | **[AUTO]** `timer-recovery.spec.ts` |

---

## Timer — Entry Edit

<!--
Story: As a user I can edit a stopped time entry's description, project, tags, Notion task,
  and ONE time boundary (start OR end — not both).
Expected: Clicking the edit icon opens the "Edit entry" modal with all fields pre-populated.
  Editing start time locks the end time (shows 🔒 icon) and vice versa.
  Saving fires PATCH /api/entries/:id (200 OK). The entry card immediately reflects changes.
  Duration is recalculated when start or end time is changed.
  Attempting to edit a second boundary after the first is rejected (400).
-->

| Check | Coverage |
|---|---|
| Edit icon on entry opens "Edit entry" modal with all fields pre-populated | **[BROWSER]** verified 2026-06-01 |
| Description field is editable and saves correctly | **[BROWSER]** verified 2026-06-01 |
| Changing start time locks end time (🔒 icon appears) | **[BROWSER]** verified 2026-06-01 |
| Duration recalculates after time boundary edit | **[BROWSER]** verified 2026-06-01 (00:02:17 → 00:04:25 after moving start earlier) |
| Saving fires PATCH /api/entries/:id (200 OK) | **[BROWSER]** verified 2026-06-01 |
| Entry card reflects edited description and updated duration | **[BROWSER]** verified 2026-06-01 |
| Discord notification failure returns 200 + warning (not 500) | **[BROWSER]** bug fixed 2026-06-01 — was returning 500 for non-fatal Discord failure |
| Cannot edit active (running) timer entry times (400 error) | **[MANUAL]** attempt time edit via API on running entry |
| Cannot edit a second boundary once one is already saved (400) | **[MANUAL]** edit start, save; then attempt to edit end — expect 400 |

---

## Timer — Entry Deletion

<!--
Story: As a user I can delete a stopped time entry. A confirmation modal must appear with
  Cancel as the primary (highlighted) button and Delete as the danger button.
  After confirming, the entry disappears from the list.
Expected: DELETE /api/entries/:id returns 200 { success: true }.
  The "Last 7 Days" list removes the entry; Sessions count decrements.
-->

| Check | Coverage |
|---|---|
| Delete icon shows confirmation modal "Are you sure? Cannot be undone." | **[BROWSER]** verified 2026-06-01 |
| Cancel button is visually highlighted (primary variant) | **[BROWSER]** verified 2026-06-01 |
| Delete button is danger (red text) | **[BROWSER]** verified 2026-06-01 |
| Confirming deletion fires DELETE /api/entries/:id (200 OK) | **[BROWSER]** verified 2026-06-01 |
| Entry disappears from "Last 7 Days" after deletion | **[BROWSER]** verified 2026-06-01 |

---

## Timer — Restart from Entry

<!--
Story: As a user I can click the play icon on a past entry to restart a timer pre-filled
  with the same description, project, and tags (but not time boundaries).
Expected: Clicking "Start timer from this entry" starts a new session with the prior entry's fields.
-->

| Check | Coverage |
|---|---|
| "Start timer from this entry" button visible on entry cards | **[BROWSER]** observed 2026-06-01 |
| Clicking it starts a new session pre-filled with prior entry's fields | **[MANUAL]** start from entry; verify description/project/tags pre-filled |

---

## Reports

<!--
Story: As an admin I see all users' time entries in /reports. As a member I see only my own.
  Date-range, member, project, and tag filters narrow the list. Totals update on filter change.
Expected: /reports loads without 500, shows entry rows and "Total Hours" / "Sessions" stats.
-->

| Check | Coverage |
|---|---|
| `/reports` loads without error (heading + entry list visible) | **[AUTO]** `reports-page.spec.ts` |
| Total Hours and Sessions stats are shown | **[AUTO]** `test-accounts-users-reports.spec.ts` |
| Date-range filter re-renders without error | **[AUTO]** `reports-page.spec.ts` |
| Member filter, project filter, and tag filter work | **[MANUAL]** apply each filter; verify row counts change |
| Search box filters by description, project, tag, and user name | **[MANUAL]** enter known terms; verify filtered rows |
| Export CSV button present | **[BROWSER]** observed 2026-06-01 |
| Admin sees all users' entries; member sees only own entries | **[MANUAL]** compare row sets between roles |

---

## Navigation / Page Load

<!--
Story: All main pages load without crashing for an authenticated user.
  Members are redirected away from /team; admins can reach /control.
-->

| Check | Coverage |
|---|---|
| `/timer`, `/projects`, `/tags`, `/teams`, `/team`, `/reports`, `/control`, `/settings` all load | **[BROWSER]** verified 2026-06-01 |
| Member visiting `/team` redirects to `/timer` (not 500) | **[AUTO]** `nav-pages-smoke.spec.ts` |
| Admin visiting `/control` loads Notion settings without error | **[BROWSER]** verified 2026-06-01 |
| Control page shows Notion DB IDs from `/api/control` response | **[AUTO]** `control-production.spec.ts` |
| SSE (`/api/sse`) reconnects after drop (ERR_INCOMPLETE_CHUNKED_ENCODING) | **[BROWSER]** observed 2026-06-01 — SSE reconnect errors are expected on App Runner; timer state restored from /api/timer/active |

---

## Tags

<!--
Story: Tags are per-user. Normal users see only their own tags; admins see all with owner names.
  Tags can be created inline from the timer or from /tags. Multi-tag entries use time_entry_tags join table.
-->

| Check | Coverage |
|---|---|
| `/tags` loads with tag list (no crash) | **[BROWSER]** verified 2026-06-01 |
| Admin sees 160 tags with Owner column | **[BROWSER]** verified 2026-06-01 |
| New tag created inline from timer via TagMultiSelect | **[BROWSER]** verified 2026-06-01 — POST /api/tags (201) |
| Tag chip appears on stopped entry card | **[BROWSER]** verified 2026-06-01 |
| Normal user sees only own tags | **[MANUAL]** sign in as member; verify tag list is scoped |
| Deleting a tag removes associations but preserves time entries | **[MANUAL]** delete tag; confirm entries still exist without the tag |

---

## Projects

<!--
Story: All users can read projects for timer selection. Only admins can create, edit, archive, or delete.
  Deleting a project also deletes all linked time entries (confirmation modal required).
-->

| Check | Coverage |
|---|---|
| `/projects` loads (16 active projects visible for admin) | **[BROWSER]** verified 2026-06-01 |
| "+ New Project" button visible for admin | **[BROWSER]** verified 2026-06-01 |
| "+ New Project" button hidden for members | **[MANUAL]** sign in as member; verify button absent |
| Project appears in timer dropdown after creation | **[MANUAL]** create project; reload timer; confirm it appears in dropdown |
| Delete project shows confirmation modal with Cancel highlighted | **[MANUAL]** attempt delete; verify modal UX |
| Deleting project removes it from timer dropdown | **[MANUAL]** delete project; reload timer; confirm it is absent |

---

## Users / Team

<!--
Story: Admins and HR can see and manage all users. Team leads see only members within their team scope.
  Members cannot access /team (redirected). Active timer indicators show who is working live.
  Admins can create invitation links from the Users page (Notion Team Member picker + multi-team assign).
-->

| Check | Coverage |
|---|---|
| `/team` loads for admin with user table (roles, teams, actions) | **[BROWSER]** verified 2026-06-01 |
| Users tab and Teams tab present | **[BROWSER]** verified 2026-06-01 |
| "0 live now" indicator displayed in header | **[BROWSER]** verified 2026-06-01 |
| Member visiting `/team` is redirected to `/timer` | **[AUTO]** `nav-pages-smoke.spec.ts` |
| HR / team lead sees only in-scope users | **[AUTO]** `test-accounts-users-reports.spec.ts` |
| Edit user modal shows Applicant status as read-only | **[AUTO]** `applicant-status-readonly.spec.ts` |
| `/api/users` returns 200 after sign-in | **[AUTO]** `users-page-production.spec.ts` |
| Terminated/Graduated user cannot log in | **[MANUAL]** set status in Hephaestus HR; attempt login |
| Admin sees **Invites** tab on `/team` with **Pending invitations** and **Invite Member** | **[AUTO]** `invitations-production.spec.ts` |
| `GET /api/invitations` returns 200 with `{ invitations: [] }` for admin | **[AUTO]** `invitations-production.spec.ts` |
| Invalid `/register?invite=<token>` shows rejection (not valid / expired / used) | **[AUTO]** `invitations-production.spec.ts` |
| Admin creates invite (Notion existing page or create-new) → copy link → register → sign in | **[MANUAL]** full Notion-backed flow |
| Disable/delete pending invite from Users page | **[MANUAL]** disable link; confirm register rejects token |
| Invite form only shows `isActive = true` teams | **[MANUAL]** archive team in Notion; sync; confirm absent from dropdown |

---

## Teams

<!--
Story: Teams come from Notion sync. Admin can view all teams with member stats.
  Inactive teams are labelled "Inactive". Members/teams link is read-only; Notion is the source of truth.
-->

| Check | Coverage |
|---|---|
| `/teams` loads with team list and stats (Members, Live Now, This Week, Avg Weekly) | **[BROWSER]** verified 2026-06-01 |
| Inactive teams show "Inactive" badge | **[BROWSER]** verified 2026-06-01 |
| Team detail shows member list with Active/Inactive status | **[BROWSER]** verified 2026-06-01 |
| Teams sync cron (`/api/cron/teams-sync`) requires `CRON_SECRET` | **[MANUAL]** call with valid and invalid secret; assert 401 vs 200 |
| Invite team dropdown only shows active teams after sync | **[MANUAL]** archive a team in Notion; run sync; confirm it disappears from invite dropdown |

---

## Task Search (Notion)

<!--
Story: Timer form has a Notion task picker that queries /api/tasks?q=<text>.
  The picker shows results or "not configured" hint.
-->

| Check | Coverage |
|---|---|
| Typing in Notion task search fires GET /api/tasks?q= and returns results | **[BROWSER]** verified 2026-06-01 |
| `/api/tasks?q=a` returns `{ tasks: [], meta: { taskSearchConfigured } }` | **[AUTO]** `task-search.spec.ts` |
| Task picker shows results dropdown on input | **[BROWSER]** verified 2026-06-01 |
| Selecting a task fires PATCH /api/timer with notionTaskPageId + notionTaskTitle | **[BROWSER]** verified 2026-06-01 |
| Notion task link on entry card opens correct Notion page | **[BROWSER]** observed 2026-06-01 |

---

## Settings & Profile

<!--
Story: Users can change display name, password, and theme preference.
  Theme selection persists across reload via localStorage.
-->

| Check | Coverage |
|---|---|
| `/settings` loads with Appearance, Profile, Password, Session sections | **[BROWSER]** verified 2026-06-01 |
| Appearance dropdown shows Light / Dark / System | **[BROWSER]** verified 2026-06-01 |
| Theme selection persists across reload (html.dark class + localStorage) | **[MANUAL]** toggle dark; reload; confirm html.dark class present |
| Profile: display name change saved via `/api/users/:id` | **[MANUAL]** change name; reload; confirm DB row updated |
| Password: update requires current + new + confirm fields | **[BROWSER]** form visible 2026-06-01 |
| Log out button terminates session (redirects to /login) | **[MANUAL]** click Log out; confirm redirect |

---

## Authentication & Password Reset

<!--
Story: Login is credentials-based. Registration is invite-only.
  Forgot password sends a reset email (rate-limited). Reset link allows new password.
-->

| Check | Coverage |
|---|---|
| All `test_users.json` accounts can sign in | **[AUTO]** `all-accounts-production.spec.ts` |
| Login page has "Forgot password" link | **[AUTO]** `forgot-password-production.spec.ts` |
| Forgot-password accepts any email without leaking account existence | **[AUTO]** `forgot-password-production.spec.ts` |
| Second reset request within cooldown returns `cooldown: true` | **[AUTO]** `forgot-password-production.spec.ts` |
| `/register?invite=<token>` requires a valid token; invalid/expired returns error | **[AUTO]** `invitations-production.spec.ts` |
| `/register?invite=<token>` acceptance creates account with `status`/`stage` joined and signs in | **[MANUAL]** complete invite registration flow |
| `/register?reset=<token>` sets new password; user can then log in | **[MANUAL]** use test-mode token; complete reset; verify login |

---

## Weekly Momentum Widget

<!--
Story: The Weekly Momentum card shows hours logged this week, session count, and
  the active or last project name.
  Active Project updates immediately when a project is selected during a running session.
  After stopping, it switches to Last Project.
-->

| Check | Coverage |
|---|---|
| "Active Project" shows selected project name immediately during a running session | **[BROWSER]** verified 2026-06-01 — bug fixed: was looking up from weekEntries not activeTimer.projectName |
| "Active Project" → "Last Project" transition on stop | **[BROWSER]** verified 2026-06-01 |
| Hours logged accumulates with elapsed time while running | **[BROWSER]** observed (counter updates live) |
| Sessions count increments on start and decrements on delete | **[BROWSER]** verified 2026-06-01 |

---

## Notion Sync

<!--
Story: Chronos syncs time entries to a Notion database and teams from Notion.
  Cron routes are secured by CRON_SECRET.
-->

| Check | Coverage |
|---|---|
| Stopped entry syncs to Notion (notionPageId populated) | **[MANUAL]** stop entry; check DB notionPageId is not null |
| Teams sync cron authorizes with `CRON_SECRET` | **[MANUAL]** call `/api/cron/teams-sync` with correct secret; expect 200 |
| Teams sync rejects calls without or with wrong secret | **[MANUAL]** call with invalid secret; expect 401 |

---

## Control Page

<!--
Story: Admin-only page for managing Notion integration keys and DB IDs.
  Notion secret key is masked; DB IDs are shown for reference.
-->

| Check | Coverage |
|---|---|
| `/control` loads for admin without error | **[BROWSER]** verified 2026-06-01 |
| Notion secret key shown as masked (ntn_43•••••A2kW) | **[BROWSER]** verified 2026-06-01 |
| Notion DB IDs (Tasks, Team Members, Teams, Onboardings, Time Entries) all shown | **[BROWSER]** verified 2026-06-01 |
| Notion DB ID field in control matches `/api/control` response | **[AUTO]** `control-production.spec.ts` |

---

## Build & Type-Check

| Check | Coverage |
|---|---|
| `pnpm exec tsc --noEmit` passes | **[MANUAL]** run before merging to main |
| `pnpm run build` passes | **[MANUAL]** run before merging to main |
| Cron routes (`daily-summary`, `teams-sync`) still authorize with `CRON_SECRET` | **[MANUAL]** smoke-call each with the secret |

---

## Known Issues / Notes (2026-06-01)

- **SSE reconnects**: `/api/sse` regularly fires `ERR_INCOMPLETE_CHUNKED_ENCODING` in the browser console. This is expected on App Runner's HTTP/1.1 termination of long-lived chunked streams. The client reconnects automatically and restores timer state via `/api/timer/active`. Not a user-visible bug.
- **Weekly Momentum "Last 7 Days" after fresh deploy**: On App Runner redeploy, Redis clears and the calendar-week DB query may show 0 entries if the user has no completed entries in the current ISO week. Entries from prior weeks still appear in Reports.
- **One-boundary edit rule**: Each time entry allows editing either start OR end time — not both. Once one boundary is saved, the other is permanently locked for that entry (`editedField` column enforces this).
