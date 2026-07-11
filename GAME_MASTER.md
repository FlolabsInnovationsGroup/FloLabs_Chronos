# GAME_MASTER.md — FloLabs Chronos

## Current Status

**Stack:** Next.js 16 + Drizzle + AWS RDS PostgreSQL 16 + AWS ElastiCache Redis + NextAuth v5; production on AWS App Runner
**App Runner URL:** https://hcmsmnfq5q.us-east-1.awsapprunner.com
**Production domain:** https://athensgreecemarathon.com
**Database:** AWS RDS PostgreSQL 16 (`flolabs-db.ccxceiswgkrj.us-east-1.rds.amazonaws.com/neondb`). Migrated from Neon 2026-06-01. URL in AWS SSM `/flolabs-chronos/DATABASE_URL`.
**Latest deployed commit:** `7951ca3` (2026-07-11) — restore admin invitation system (pending deploy: CodeBuild queue limit blocked pipeline)
**Last E2E run:** 2026-06-09 — 39 passed, 2 skipped (forgot-password API test-mode + applicant-status-readonly), 0 failures

**Identity:** `flolabs_users` single shared table with Hephaestus. No separate `applicants` table. `session.user.id` = `flolabs_users.id`.
**Timer persistence:** `src/lib/timer-recovery.ts` — `restoreTimerFromDb()` on Redis miss; stale timers >24h auto-closed.
**TopBar:** shows live `HH:MM:SS` counter next to stop button while timer is active.
**E2E:** 39/41 tests pass (2 skipped: forgot-password API test-mode + applicant-status-readonly requires env vars).

**Known lint issues:** pre-existing ESLint warnings in auth/control, tooltip, report-filter, timer-dashboard, and Discord-provisioning files. `pnpm exec tsc --noEmit` and `pnpm build` are green.

**Role distribution:** ~6 admin, ~7 team_lead, ~4 hr, ~1132 member
**Admin account:** `pm@flolabsinnovations.com`

---

## Source Of Truth

- `ARCHITECTURE.md` — operating model and data contract
- `CLAUDE.md` — implementation guardrails for coding agents
- `DEPLOYMENT.md` — proven production deploy path

---

## What's Next (V1.2 candidates)

- [ ] Email delivery for invitations (Resend integration)
- [ ] Password change in settings
- [ ] Team lead ability to invite members to their own team
- [ ] Mobile-optimized bottom nav improvements
- [ ] Audit log for admin actions

---

## Handoff Checklist

1. Read `CLAUDE.md` for coding rules
2. Check this file for current status
3. Run `pnpm exec tsc --noEmit && pnpm build` — must be green
4. Confirm `src/lib/db/schema.ts` matches the live database
5. If schema changed, write a migration script in `scripts/` and run it
6. After completing a feature, update `ARCHITECTURE.md` and this file
