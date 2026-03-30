# FloLabs Chronos

Internal time-tracking and team-management app for FloLabs.

## Core functionality

- Live timer tracking with Redis-backed active timers
- Team-scoped reporting
- Admin-managed projects
- Invite-only onboarding
- Admin team management
- Delayed tooltips for icon-only controls (3-second hover)
- Admin controls to disable or delete invitation links
- Admin ability to delete team members who have no time entries
- Confirmation modals for destructive actions, with **Cancel** as the highlighted option

## Getting started

```bash
pnpm install
pnpm dev
```

Open <http://localhost:3000>

## Environment

Set the required env vars in `.env.local`.

## Notes

- Registration is invite-only.
- Non-admin users are team-scoped.
- Member deletion is blocked if historical time entries exist; deactivate or preserve history instead.
