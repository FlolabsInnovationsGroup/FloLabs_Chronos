
BEGIN;
CREATE TEMP TABLE import_users (id uuid, email text, name text, password text, role text, team_id uuid, is_active boolean, notion_team_member_id text) ON COMMIT DROP;
CREATE TEMP TABLE import_projects (id uuid, name text, created_by_id uuid) ON COMMIT DROP;
CREATE TEMP TABLE import_entries (id uuid, user_id uuid, project_id uuid, description text, started_at timestamptz, stopped_at timestamptz, duration_ms bigint, notion_page_id text, notion_task_page_id text, notion_task_title text) ON COMMIT DROP;
CREATE TEMP TABLE import_tags (id uuid, name text, user_id uuid) ON COMMIT DROP;
\copy import_users FROM '/bundle/users.csv' WITH (FORMAT csv)
\copy import_projects FROM '/bundle/projects.csv' WITH (FORMAT csv)
\copy import_entries FROM '/bundle/time_entries.csv' WITH (FORMAT csv)
\copy import_tags FROM '/bundle/tags.csv' WITH (FORMAT csv)
INSERT INTO users (id, email, name, password, role, team_id, is_active, notion_team_member_id)
SELECT id, email, name, password, role, team_id, is_active, nullif(notion_team_member_id, '')
FROM import_users
ON CONFLICT (email) DO NOTHING;
INSERT INTO projects (id, name, created_by_id)
SELECT id, name, created_by_id
FROM import_projects
ON CONFLICT DO NOTHING;
INSERT INTO time_entries (id, user_id, project_id, description, started_at, stopped_at, duration_ms, notion_page_id, notion_task_page_id, notion_task_title, synced_at)
SELECT id, user_id, project_id, description, started_at, stopped_at, duration_ms, notion_page_id, nullif(notion_task_page_id, ''), nullif(notion_task_title, ''), now()
FROM import_entries
ON CONFLICT DO NOTHING;
INSERT INTO tags (id, name, user_id)
SELECT id, name, user_id
FROM import_tags
ON CONFLICT (name, user_id) DO NOTHING;
COMMIT;
