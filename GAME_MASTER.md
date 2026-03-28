# GAME_MASTER.md — FloLabs Chronos Development Tracker

## Project Status: V1 In Progress
**Started:** 2026-03-28 14:54 CET
**Tech:** Next.js 16 + Drizzle + Neon Postgres + Vercel KV + NextAuth v5
**Design:** Vellum Ink (editorial/paper aesthetic)

## Build Status
✅ `next build` passes clean (no errors) — verified after wave 1
✅ All API routes exist and compile (including dynamic [id] routes)
✅ All page routes exist and compile
✅ DB schema complete with all columns from ARCHITECTURE.md
✅ Auth flow implemented (NextAuth v5 credentials)
✅ Timer hooks (use-timer, use-sse)
✅ Fonts loaded: Newsreader + Work Sans (next/font/google) + Material Symbols
✅ Vellum Ink design audit complete (commit 142b2b0)
✅ Notion/Discord/Redis integrations reviewed and fixed
✅ Seed script, vercel.json, .env.example all present

## Wave 1 Results (14:55–15:06)
- Agent 1 ✅ Core UI/UX: fonts, dynamic API routes (projects/[id], users/[id]), middleware
- Agent 2 ✅ Backend: notion.ts property types, SSE cancel fix, discord exports, .env.example
- Agent 3 ✅ Design: Vellum Ink violations fixed (rounded-full→md, bg-white→tokens, borders removed)

## Remaining V1 Gaps (Wave 2)

### AGENT 4: CSV Export + Settings Page + Entry CRUD ✅
- [x] Add CSV export button to reports page (ExportCSVButton client component, variant=secondary)
- [x] Create /api/entries/[id]/route.ts with PATCH (edit) and DELETE (owner or admin)
- [x] Create settings page at src/app/(dashboard)/settings/page.tsx (name + password change)
- [x] EntryCard has edit modal (description/project/tag) + delete confirmation modal

### AGENT 5: End-to-End Flow Polish + Testing
- [ ] Verify login→register→dashboard flow logic
- [ ] Ensure timer page properly loads projects/tags even when DB is empty (graceful empty states)
- [ ] Add proper loading states and error boundaries where missing
- [ ] Ensure reports page has proper empty state
- [ ] Run through all TypeScript strict checks — fix any remaining type issues
- [ ] Ensure all pages have proper page titles/metadata

## Agent History

| Agent | Session | Status | Task |
|-------|---------|--------|------|
| Agent 1 | clear-reef | ✅ DONE | Core UI/UX Polish |
| Agent 2 | marine-mist | ✅ DONE | Integration & Backend |
| Agent 3 | briny-crest | ✅ DONE | Design Fidelity |
| Agent 4 | swift-breeze | ✅ DONE | CSV Export + Settings + Entry CRUD |
| Agent 5 | crisp-dune | RUNNING | End-to-End Flow + Polish |

## Completion Criteria (V1)
- App builds with `next build` → no errors
- Login page works (credentials auth)
- Timer: start, see elapsed, stop, entry saved
- Projects: list, create, edit, archive
- Team: list users, invite user (admin only)
- Reports: filter by date/project/user, see table + chart, CSV export
- Settings page: basic user profile
- Entries: edit and delete past entries
- Responsive: desktop sidebar + mobile bottom nav
- Vellum Ink design: cream bg, Newsreader headings, paper shadows, no #000

## Notes
- No DATABASE_URL in env — build uses graceful fallback (`if (!db) return []`)
- The app is a Next.js project using pnpm
- Read CLAUDE.md and ARCHITECTURE.md for full context
