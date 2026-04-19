import csv
import json
import os
import re
import unicodedata
import uuid
from collections import OrderedDict
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(r"C:\Users\olire\Documents\workspace_python\FloLabs_Chronos")
HERMES_CSV = Path(r"C:\Users\olire\Documents\workspace_python\FloLabs_Hermes\old_workflow_assets\Time_Entries_2026-04-20\Time Entries 297a157695518075ab6cea94e60e4220_all.csv")
OUT_DIR = ROOT / "temp" / "notion-import"
OUT_DIR.mkdir(parents=True, exist_ok=True)


def slugify(value: str) -> str:
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    value = re.sub(r"[^a-zA-Z0-9]+", "-", value.lower()).strip("-")
    return value[:80] or "team"


def imported_email(name: str, notion_id: str) -> str:
    local = slugify(name or notion_id or str(uuid.uuid4()))
    return f"{local or 'imported'}@imported.local"


def extract_notion_id(value: str | None) -> str | None:
    if not value:
        return None
    match = re.search(r"([0-9a-f]{32})(?:\?|\)|$)", value, flags=re.I)
    return match.group(1).lower() if match else None


def parse_date_range(value: str):
    if not value or "→" not in value:
        return None, None
    start_raw, end_raw = [part.strip() for part in value.split("→", 1)]
    m = re.match(r"^(.+?)\s+\((GMT[+-]\d+)\)$", start_raw, flags=re.I)
    if not m:
        return None, None
    start_base, gmt = m.group(1).strip(), m.group(2).upper()
    offset = gmt.replace("GMT", "")
    if re.fullmatch(r"[+-]\d{1,2}", offset):
        offset = f"{offset[0]}{int(offset[1:]):02d}00"
    start_dt = datetime.strptime(f"{start_base} {offset}", "%B %d, %Y %I:%M %p %z")
    end_clean = re.sub(r"\s*\(GMT[+-]\d+\)\s*$", "", end_raw).strip()
    try:
        end_dt = datetime.strptime(f"{end_clean} {offset}", "%I:%M %p %z")
        end_dt = end_dt.replace(year=start_dt.year, month=start_dt.month, day=start_dt.day)
    except ValueError:
        end_dt = datetime.strptime(f"{end_clean} {offset}", "%B %d, %Y %I:%M %p %z")
    if end_dt < start_dt:
        end_dt += timedelta(days=1)
    return start_dt.astimezone(timezone.utc), end_dt.astimezone(timezone.utc)


def load_env(path: Path):
    env = {}
    if not path.exists():
        return env
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line or line.strip().startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        value = value.strip().strip('"').strip("'")
        env[key.strip()] = value
    return env


env = {}
env.update(load_env(ROOT / ".env.local"))
env.update(load_env(ROOT / ".env.production.local"))
database_url = env.get("DATABASE_URL") or env.get("FL_CHRONOS_DATABASE_URL") or env.get("FL_CHRONOS_DATABASE_URL_UNPOOLED")
if not database_url:
    raise SystemExit("DATABASE_URL not found in env files")

import subprocess

def psql_tsv(sql: str):
    result = subprocess.run(
        ["docker", "run", "--rm", "postgres:16", "psql", database_url, "-At", "-F", "\t", "-c", sql],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=True,
    )
    return [line.split("\t") for line in result.stdout.splitlines() if line.strip()]

existing_users = psql_tsv("select id, email, name, coalesce(notion_team_member_id,''), coalesce(team_id::text,'') from users")
existing_projects = psql_tsv("select id, name from projects")
existing_entries = {row[0].lower() for row in psql_tsv("select notion_page_id from time_entries where notion_page_id is not null")}
admin_rows = psql_tsv("select id from users where email = 'pm@flolabsinnovations.com' limit 1")
if not admin_rows:
    raise SystemExit("Admin user not found")
admin_id = admin_rows[0][0]

user_by_notion = {row[3].lower(): {"id": row[0], "email": row[1], "name": row[2], "team_id": row[4]} for row in existing_users if row[3]}
user_by_name = {row[2].strip().lower(): {"id": row[0], "email": row[1], "name": row[2], "team_id": row[4], "notion_team_member_id": row[3]} for row in existing_users}
project_by_name = {row[1].strip().lower(): {"id": row[0], "name": row[1]} for row in existing_projects}

team_id = None
for row in psql_tsv("select id, name from teams where lower(name) = lower('Imported Team') limit 1"):
    team_id = row[0]
if not team_id:
    team_id = str(uuid.uuid4())

new_users = OrderedDict()
new_projects = OrderedDict()
entry_rows = []
user_tag_pairs = set()
entry_tag_pairs = []

with HERMES_CSV.open("r", encoding="utf-8-sig", newline="") as f:
    reader = csv.DictReader(f)
    for row in reader:
        notion_page_id = (row.get("Entry ID") or "").strip()
        if not notion_page_id:
            continue
        if notion_page_id.lower() in existing_entries:
            continue
        started_at, stopped_at = parse_date_range(row.get("Date") or "")
        duration = row.get("Duration") or "0"
        try:
            duration_ms = int(round(float(duration) * 1000))
        except ValueError:
            continue
        if not started_at or not stopped_at or duration_ms <= 0:
            continue

        team_member_cell = (row.get("Team Member") or "").strip()
        team_member_name = re.sub(r"\s*\(https?://[^)]*\)\s*$", "", team_member_cell).strip()
        team_member_notion_id = extract_notion_id(team_member_cell)
        user_key = (row.get("User Key") or "").strip()

        user = None
        if team_member_notion_id and team_member_notion_id.lower() in user_by_notion:
            user = user_by_notion[team_member_notion_id.lower()]
        elif team_member_name and team_member_name.lower() in user_by_name:
            user = user_by_name[team_member_name.lower()]
        elif user_key and user_key.lower() in user_by_name:
            user = user_by_name[user_key.lower()]
        else:
            base_name = team_member_name or user_key or f"Imported User {notion_page_id}"
            if base_name.lower() not in new_users:
                new_users[base_name.lower()] = {
                    "id": str(uuid.uuid4()),
                    "email": imported_email(base_name, notion_page_id),
                    "name": base_name,
                    "password": "imported-not-login-enabled",
                    "role": "member",
                    "team_id": team_id,
                    "notion_team_member_id": team_member_notion_id or "",
                }
            user = new_users[base_name.lower()]
            if team_member_notion_id:
                user_by_notion[team_member_notion_id.lower()] = user
            user_by_name[base_name.lower()] = user

        project_name = (row.get("Project") or "").strip() or "Imported"
        project = project_by_name.get(project_name.lower())
        if not project:
            if project_name.lower() not in new_projects:
                new_projects[project_name.lower()] = {
                    "id": str(uuid.uuid4()),
                    "name": project_name,
                    "created_by_id": admin_id,
                }
            project = new_projects[project_name.lower()]
            project_by_name[project_name.lower()] = project

        task_raw = (row.get("Task") or "").strip()
        task_title = re.sub(r"\s*\(https?://[^)]*\)\s*$", "", task_raw).strip()
        task_page_id = extract_notion_id(task_raw)
        description = (row.get("Description") or "").strip() or "Imported entry"

        entry_id = str(uuid.uuid4())
        entry_rows.append({
            "id": entry_id,
            "user_id": user["id"],
            "project_id": project["id"],
            "description": description,
            "started_at": started_at.isoformat(),
            "stopped_at": stopped_at.isoformat(),
            "duration_ms": duration_ms,
            "notion_page_id": notion_page_id,
            "notion_task_page_id": task_page_id or "",
            "notion_task_title": task_title,
        })

        raw_tags = (row.get("Tags") or "").strip()
        if raw_tags:
            for tag in [t.strip() for t in raw_tags.split(",") if t.strip()]:
                user_tag_pairs.add((user["id"], tag))
                entry_tag_pairs.append((entry_id, user["id"], tag))

users_csv = OUT_DIR / "users.csv"
projects_csv = OUT_DIR / "projects.csv"
entries_csv = OUT_DIR / "time_entries.csv"
tags_csv = OUT_DIR / "tags.csv"
entry_tags_json = OUT_DIR / "entry_tag_pairs.json"
meta_json = OUT_DIR / "meta.json"

with users_csv.open("w", encoding="utf-8", newline="") as f:
    writer = csv.writer(f)
    for user in new_users.values():
        writer.writerow([user["id"], user["email"], user["name"], user["password"], user["role"], user["team_id"], "true", user["notion_team_member_id"]])

with projects_csv.open("w", encoding="utf-8", newline="") as f:
    writer = csv.writer(f)
    for project in new_projects.values():
        writer.writerow([project["id"], project["name"], admin_id])

with entries_csv.open("w", encoding="utf-8", newline="") as f:
    writer = csv.writer(f)
    for entry in entry_rows:
        writer.writerow([
            entry["id"],
            entry["user_id"],
            entry["project_id"],
            entry["description"],
            entry["started_at"],
            entry["stopped_at"],
            entry["duration_ms"],
            entry["notion_page_id"],
            entry["notion_task_page_id"],
            entry["notion_task_title"],
        ])

with tags_csv.open("w", encoding="utf-8", newline="") as f:
    writer = csv.writer(f)
    for user_id, tag_name in sorted(user_tag_pairs):
        writer.writerow([str(uuid.uuid4()), tag_name, user_id])

entry_tags_json.write_text(json.dumps(entry_tag_pairs, ensure_ascii=False), encoding="utf-8")
meta_json.write_text(json.dumps({
    "new_users": len(new_users),
    "new_projects": len(new_projects),
    "new_entries": len(entry_rows),
    "new_user_tags": len(user_tag_pairs),
    "entry_tag_pairs": len(entry_tag_pairs),
    "team_id": team_id,
}, indent=2), encoding="utf-8")

print(json.dumps({
    "users_csv": str(users_csv),
    "projects_csv": str(projects_csv),
    "entries_csv": str(entries_csv),
    "tags_csv": str(tags_csv),
    "entry_tags_json": str(entry_tags_json),
    "meta_json": str(meta_json),
}, indent=2))
