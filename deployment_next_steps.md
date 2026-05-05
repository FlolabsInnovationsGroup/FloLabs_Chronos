# 🚨 CHRONOS DEPLOYMENT: MANDATORY CHECKLIST 🚨

**STATUS:** **CRITICAL BLOCKER.** The system cannot proceed to validation until the following mandatory steps are completed sequentially.
**OWNER:** AI Orchestrator / Agent `marine-bloom`

## ⚙️ DEVELOPMENT/DEPLOYMENT CHECKLIST (Sequence MUST be followed)

1.  **[Code Fixes]:** Implement fixes for:
    *   Users not seeing past time entries.
    *   FloLabs accounts not appearing on the Users page.
    *   Notion Task search failure.
2.  **[Internal File Update]:** Verify all credentials (`Notion API Key`, `Time Entries DB ID`) are correctly loaded into the deployment environment variables on AWS App Runner.
3.  **[Deployment]:** Execute the build and deployment to the **AWS Staging Environment**. This must be traceable via the CI/CD logs.
4.  **[Validation (LIVE TEST)]:** **DO NOT STOP.** After deployment, execute a test script using the accounts in `test_users.json`.
    *   **Validation Target:** Successful login and verification of all 3 features using the test accounts.
5.  **[SUCCESS]:** Only upon successful validation is the task considered complete.

**FAILURE TO EXECUTE THIS SEQUENCE IS A BLOCKER.**
