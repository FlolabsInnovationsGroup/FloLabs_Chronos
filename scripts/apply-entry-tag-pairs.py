import json
import subprocess
from pathlib import Path

ROOT = Path(r"C:\Users\olire\Documents\workspace_python\FloLabs_Chronos")
BUNDLE = ROOT / "temp" / "notion-import"
PAIRS = json.loads((BUNDLE / "entry_tag_pairs.json").read_text(encoding="utf-8"))


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


def psql(sql: str):
    result = subprocess.run(
        ["docker", "run", "--rm", "postgres:16", "psql", conn, "-At", "-F", "\t", "-c", sql],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=True,
    )
    return result.stdout.strip()

batch_size = 50
applied = 0
for i in range(0, len(PAIRS), batch_size):
    chunk = PAIRS[i:i + batch_size]
    values = []
    for entry_id, user_id, tag_name in chunk:
        tag_name_sql = tag_name.replace("'", "''")
        values.append(f"('{entry_id}'::uuid, '{user_id}'::uuid, '{tag_name_sql}')")
    sql = f"""
    WITH payload(entry_id, user_id, tag_name) AS (
      VALUES {', '.join(values)}
    )
    INSERT INTO time_entry_tags (time_entry_id, tag_id)
    SELECT p.entry_id, t.id
    FROM payload p
    JOIN tags t ON t.user_id = p.user_id AND lower(t.name) = lower(p.tag_name)
    ON CONFLICT DO NOTHING;
    """
    psql(sql)
    applied += len(chunk)
    print(f"Applied {applied}/{len(PAIRS)} tag links")
