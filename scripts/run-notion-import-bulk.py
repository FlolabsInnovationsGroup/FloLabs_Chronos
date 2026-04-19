import json
import subprocess
from pathlib import Path

BUNDLE = Path(r"C:\Users\olire\Documents\workspace_python\FloLabs_Chronos\temp\notion-import")
ROOT = Path(r"C:\Users\olire\Documents\workspace_python\FloLabs_Chronos")

def load_env(path: Path):
    env = {}
    if not path.exists():
        return env
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line or line.strip().startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        env[key.strip()] = value.strip().strip('"').strip("'")
    return env

env = {}
env.update(load_env(ROOT / ".env.local"))
env.update(load_env(ROOT / ".env.production.local"))
conn = env.get("DATABASE_URL") or env.get("FL_CHRONOS_DATABASE_URL") or env.get("FL_CHRONOS_DATABASE_URL_UNPOOLED")
if not conn:
    raise SystemExit("DATABASE_URL not found")

sql = """
BEGIN;
CREATE TEMP TABLE import_users (id uuid, email text, name text, password text, role text, team_id uuid, is_active boolean, notion_team_member_id text) ON COMMIT DROP;
CREATE TEMP TABLE import_projects (id uuid, name text, created_by_id uuid) ON COMMIT DROP;
CREATE TEMP TABLE import_entries (id uuid, user_id uuid, project_id uuid, description text, started_at timestamptz, stopped_at timestamptz, duration_ms bigint, notion_page_id text, notion_task_page_id text, notion_task_title text) ON COMMIT DROP;
CREATE TEMP TABLE import_tags (id uuid, name text, user_id uuid) ON COMMIT DROP;
\\copy import_users FROM '/bundle/users.csv' WITH (FORMAT csv)
\\copy import_projects FROM '/bundle/projects.csv' WITH (FORMAT csv)
\\copy import_entries FROM '/bundle/time_entries.csv' WITH (FORMAT csv)
\\copy import_tags FROM '/bundle/tags.csv' WITH (FORMAT csv)
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
"""

sql_path = BUNDLE / "bulk-import.sql"
sql_path.write_text(sql, encoding="utf-8")

result = subprocess.run(
    ["docker", "run", "--rm", "-v", f"{BUNDLE.as_posix()}:/bundle", "postgres:16", "psql", conn, "-f", "/bundle/bulk-import.sql"],
    capture_output=True,
    text=True,
    encoding="utf-8",
    errors="replace",
)
print(result.stdout)
print(result.stderr)
if result.returncode != 0:
    raise SystemExit(result.returncode)

entry_tag_pairs = json.loads((BUNDLE / "entry_tag_pairs.json").read_text(encoding="utf-8"))
print(f"entry_tag_pairs remaining to apply separately: {len(entry_tag_pairs)}")
