# Notion Time Entries import state

Updated: 2026-04-20 Europe/Paris

## Source
- Hermes Notion export:
  `C:\Users\olire\Documents\workspace_python\FloLabs_Hermes\old_workflow_assets\Time_Entries_2026-04-20\Time Entries 297a157695518075ab6cea94e60e4220_all.csv`
- Approx row count loaded: 17,820

## Current AWS DB state after partial import attempts
- users: 59
- projects: 81
- tags: 3
- time_entries: 138
- time_entry_tags: 18

## What worked
- Parsing the Notion CSV works
- Date range parsing works well enough to create valid `started_at` / `stopped_at`
- Imported users can be created using `users.notion_team_member_id`
- Imported projects can be created on demand
- Time entries can be inserted into AWS RDS using `Entry ID` as `time_entries.notion_page_id`
- Sample imported historical rows exist from 2025-11-03 onward

## What failed
- Drizzle/pg direct script path hit TLS/self-signed certificate issues against the AWS DB in this environment
- First row-by-row importer was too slow and got killed before completion
- First batched importer still had process/runtime issues and also got killed before completing the full dataset

## Important scripts created during this migration attempt
- `scripts/import-notion-entries-from-csv.ts`
- `scripts/import-notion-entries-from-csv.js`
- `scripts/import-notion-entries-from-csv-batched.js`

These are work-in-progress scripts, not yet trusted as final.

## Recommendation for next session
1. Keep using the CSV as the source of truth instead of waiting on Neon
2. Rework the importer to use a more durable batching strategy, probably staged SQL files or COPY-friendly temp tables
3. Preserve idempotency using `Entry ID` -> `time_entries.notion_page_id`
4. Before rerunning, inspect current partial imports to avoid duplicating users/projects unnecessarily
5. When stable, finish full import and then verify counts by user/project against CSV aggregates

## Quick verification queries
- Count tables:
  - `select count(*) from users;`
  - `select count(*) from projects;`
  - `select count(*) from time_entries;`
- Top users by imported entries:
  - `select u.name, count(*) from time_entries t join users u on u.id=t.user_id group by u.name order by count(*) desc limit 20;`
- Oldest imported entries:
  - `select notion_page_id, description, started_at, stopped_at, duration_ms from time_entries order by started_at asc limit 10;`
