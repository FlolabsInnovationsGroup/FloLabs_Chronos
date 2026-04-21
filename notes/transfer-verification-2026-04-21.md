# Chronos transfer verification and login readiness

Date: 2026-04-21 Europe/Paris

## Transfer verification

Live AWS checks completed against the current production stack:
- App Runner service `flolabs-chronos` is `RUNNING`
- Last SSM import run `9cfe7e8f-4f8b-4784-8829-9cb4644c6bd3` finished with `Success`
- Live RDS counts at verification time:
  - `users`: 189
  - `projects`: 106
  - `tags`: 159
  - `time_entries`: 17,802
  - `time_entry_tags`: 6,149
- Imported time range currently present in AWS: `2024-11-25T04:44:00.000Z` to `2026-04-17T18:13:00.000Z`

## CSV-to-RDS verification pass

Source CSV:
- `C:\Users\olire\Documents\workspace_python\FloLabs_Hermes\old_workflow_assets\Time_Entries_2026-04-20\Time Entries 297a157695518075ab6cea94e60e4220_all.csv`

Observed comparison:
- CSV data rows: 17,842
- CSV unique `Entry ID` values: 17,069
- CSV rows with empty `Entry ID`: 28
- Live DB matched `Entry ID`s: 17,057
- Missing unique `Entry ID`s versus CSV: 12
- DB rows with null `notion_page_id`: 0
- CSV distinct projects: 106
- DB projects: 106

## Duplicate-note nuance

The DB has more total `time_entries` rows than unique CSV `Entry ID`s, but this appears to be caused by duplicate `Entry ID`s already present in the CSV export, not by obvious importer corruption. The top duplicate IDs in the DB matched the top duplicate IDs in the source CSV during spot checks.

## Operational conclusion

Chronos on AWS is ready for operational use.

This is not a mathematically perfect transfer yet because 12 unique source `Entry ID`s were not found in the destination, but the migration is complete enough to use the AWS system as the live environment now.

Recommended follow-up:
1. Inspect and backfill the 12 missing `Entry ID`s.
2. Decide whether repeated `Entry ID`s are valid source behavior before adding any uniqueness constraint on `time_entries.notion_page_id`.

## Login readiness

Auth path review findings:
- Current login already supports lookup by primary email or alias through `findUserByAnyEmail()` in `src/lib/auth.ts`.
- All 189 AWS users are active and have password hashes present.
- Before remediation, the AWS DB had zero rows in `user_email_aliases`, so alternate/legacy email sign-in would not have worked.

Remediation performed:
- Backfilled `user_email_aliases` from existing `users.email` values for all current users.
- Result after backfill:
  - total alias rows: 189
  - users with alias coverage: 189

Meaning:
- Every migrated user can now sign in with their current Chronos primary email and existing password.
- If there were old alternate email addresses beyond the current primary email, those still need separate backfill from authoritative applicant/HubSpot data if required.

## Remaining auth caveat

The system is ready for old accounts in the sense that existing Chronos user records and passwords are present and usable. However, truly old secondary email aliases are only recoverable if they still exist in applicant/HubSpot data or another authoritative source and are imported into `user_email_aliases`.
