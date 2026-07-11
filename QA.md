# QA — FloLabs Chronos

This project uses **[QA_CHECKLIST.md](./QA_CHECKLIST.md)** as the single QA source of truth (timer, reports, users, invitations, auth, etc.).

Production URLs:
- **App Runner:** `https://hcmsmnfq5q.us-east-1.awsapprunner.com`
- **Custom domain:** `https://athensgreecemarathon.com` (verify DNS points at App Runner before relying on it for deploy verification)

Run E2E against App Runner:

```bash
PLAYWRIGHT_BASE_URL=https://hcmsmnfq5q.us-east-1.awsapprunner.com pnpm exec playwright test
```

Invitation-related specs: `e2e/invitations-production.spec.ts`
