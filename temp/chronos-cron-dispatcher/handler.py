import json
import os
import urllib.request

BASE_URL = os.environ["CHRONOS_BASE_URL"].rstrip("/")
CRON_SECRET = os.environ["CRON_SECRET"]


def handler(event, context):
    path = event.get("path") if isinstance(event, dict) else None
    if not path:
        raise ValueError("Missing path")
    url = f"{BASE_URL}{path}"
    req = urllib.request.Request(url, method="GET", headers={"Authorization": f"Bearer {CRON_SECRET}"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        body = resp.read().decode("utf-8", errors="replace")
        return {
            "statusCode": resp.getcode(),
            "path": path,
            "body": body[:4000],
        }
