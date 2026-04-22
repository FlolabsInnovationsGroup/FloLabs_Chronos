# AGENT.md — Coding Agent Orchestration for Chronos

This file tells delegated coding agents how to work in this repository.

## Mission

Finish Chronos safely and quickly, with AWS as the only authoritative validation environment.

## Required Read Order

1. `ARCHITECTURE.md`
2. `GAME_MASTER.md`
3. `CLAUDE.md`
4. then inspect the relevant code

## Non-Negotiable Rules

- Never test Chronos behavior on the local machine.
- Never create or rely on a local test environment for Chronos validation.
- Never use local Docker, local browser testing, local app runs, or host-local smoke tests as evidence that a change works.
- Validate only through AWS / deployed surfaces:
  - App Runner
  - Lambda
  - EventBridge
  - CloudWatch
  - public deployment URLs
  - other AWS-reachable interfaces
- If AWS-only validation is blocked, report the blocker clearly instead of falling back to local testing.

## Refactor Priority

When working on the identity refactor:
- Phase 2 is already complete.
- Continue directly in Phase 3 unless `GAME_MASTER.md` says otherwise.
- Prefer small, coherent, high-leverage slices.
- Prioritize production-relevant paths first:
  1. timer flows
  2. entries/reports
  3. shared/admin/team views
  4. background sync and compatibility cleanup

## Code Change Rules

- Favor applicant-canonical identity over legacy `users`-only assumptions.
- Use compatibility fallbacks only where needed for non-backfilled rows.
- Update `GAME_MASTER.md` and relevant notes when completing a meaningful slice.
- Commit and push coherent changes unless explicitly told not to.
- Avoid unrelated workspace noise in commits.

## Validation Rules

Minimum acceptable validation for a code slice:
- run the smallest meaningful static gate available (for example TypeScript)
- then use AWS/deployed-surface validation when behavior claims matter

Do not claim production readiness without deployed proof.

## If You Get Stuck

Report:
- the concrete blocker
- what AWS-side validation path was attempted
- the smallest next step to unblock progress
