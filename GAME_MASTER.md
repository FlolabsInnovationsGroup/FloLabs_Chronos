# GAME_MASTER.md — FloLabs Chronos Development Tracker

## Project Status: V1 In Progress
**Started:** 2026-03-28 14:54 CET
**Tech:** Next.js 16 + Drizzle + Neon Postgres + Vercel KV + NextAuth v5
**Design:** Vellum Ink (editorial/paper aesthetic)

## Build Status
✅ `next build` passes clean (no errors)
✅ All API routes exist and compile
✅ All page routes exist and compile
✅ DB schema complete (users, projects, tags, time_entries — all columns from ARCHITECTURE.md)
✅ Auth flow implemented (NextAuth v5 credentials)
✅ Timer hooks (use-timer, use-sse)
✅ All components have implementations with content
✅ Seed script exists
✅ vercel.json with crons defined
✅ Layout/Sidebar/TopBar/BottomNav implemented
✅ Vellum Ink CSS tokens in globals.css

## What Needs Work (V1 Gaps)

### AGENT 1: Polish & Fix — Core UI/UX Issues ✅ DONE
**Goal:** Fix the remaining V1 issues so the app is testable end-to-end.
- [x] Landing page redirect (/ → /timer) — confirmed working
- [x] Ensure fonts load: Newsreader + Work Sans via Google Fonts in layout.tsx — confirmed correct
- [x] Fix any broken imports or missing type issues — created `/api/projects/[id]` and `/api/users/[id]` dynamic routes
- [x] Verify projects page CRUD — fixed: GET returns all projects (active+archived); PATCH dynamic route added
- [x] Verify team page CRUD — fixed: PATCH and DELETE `/api/users/[id]` dynamic route created
- [x] Reports page data flow — confirmed: server component → ReportFilters + ReportChart + ReportTable
- [x] Ensure timer page start/stop flow works end-to-end with API — confirmed correct
- [x] Add CSV export button to reports page — already present as `<a download>` tag with CSV data URI
- [x] Ensure `src/middleware.ts` properly protects routes — confirmed correct
- [x] Root layout.tsx: check Material Symbols icon font is loaded — confirmed via `<link>` tag in `<head>`

### AGENT 2: Integration & Backend Fixes
**Goal:** Make sure all backend routes and integrations are solid.
- [ ] Verify `src/lib/notion.ts` has proper Notion API client
- [ ] Verify `src/lib/discord.ts` has proper webhook helper
- [ ] Verify `src/lib/redis.ts` has proper Vercel KV connection with fallback
- [ ] Check `/api/timer/start` → writes to Redis + SSE publish
- [ ] Check `/api/timer/stop` → moves data from Redis to PostgreSQL
- [ ] Check `/api/sse` → Server-Sent Events endpoint
- [ ] Check cron routes (`/api/cron/notion-sync`, `/api/cron/daily-summary`)
- [ ] Ensure `.env.example` covers all required env vars
- [ ] Add proper error handling in all API routes
- [ ] Verify `scripts/seed.ts` runs clean when DATABASE_URL is set

### AGENT 3: Design Fidelity & Mobile
**Goal:** Match Vellum Ink design spec exactly, ensure mobile is good.
- [ ] Compare Timer page layout vs `stitch/timer_dashboard_desktop_paper_style/code.html`
- [ ] Compare Timer page layout vs `stitch/timer_dashboard_mobile_paper_style/code.html`
- [ ] Ensure Sidebar uses `surface-container-lowest` (#fff) not generic white
- [ ] Fix any `#000` usage → should be `#31332f` (on-surface)
- [ ] No 1px borders for sectioning — use background color shifts
- [ ] Paper shadows only (`0 12px 32px -4px rgba(49,51,47,0.06)`)
- [ ] All buttons match design spec (rounded-md, not rounded-full)
- [ ] Typography: Newsreader for headlines/numbers, Work Sans for body
- [ ] Mobile bottom nav properly shows/hides
- [ ] Test responsive breakpoints

## Agent Assignments

| Agent | Session | Status | Task |
|-------|---------|--------|------|
| Agent 1 | clear-reef | DONE | Core UI/UX Polish (fonts, CSV export, middleware, imports) |
| Agent 2 | marine-mist | RUNNING | Integration & Backend (notion, discord, redis, API routes) |
| Agent 3 | briny-crest | RUNNING | Design Fidelity (Vellum Ink audit, layout matching) |

## Completion Criteria (V1)
- App builds with `next build` → no errors
- Login page works (credentials auth)
- Timer: start, see elapsed, stop, entry saved
- Projects: list, create, edit, archive
- Team: list users, invite user (admin only)
- Reports: filter by date/project/user, see table + chart
- Responsive: desktop sidebar + mobile bottom nav
- Vellum Ink design: cream bg, Newsreader headings, paper shadows, no #000

## Notes
- No DATABASE_URL in env — build uses graceful fallback (`if (!db) return []`)
- The app is a Next.js project using pnpm
- Read CLAUDE.md and ARCHITECTURE.md for full context
