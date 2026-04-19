import psycopg, json
DB_URL = "postgresql://chronos:vBXSQMV3u8aFscRIKLFFCsBRTC7K8bUV@flolabs-chronos-db.ccxceiswgkrj.us-east-1.rds.amazonaws.com:5432/chronos?sslmode=require"
with psycopg.connect(DB_URL) as conn:
    with conn.cursor() as cur:
        cur.execute("select count(*) from users")
        users = cur.fetchone()[0]
        cur.execute("select count(*) from applicants")
        applicants = cur.fetchone()[0]
        cur.execute("select count(*) from user_email_aliases")
        aliases = cur.fetchone()[0]
        cur.execute("select email, role, is_active from users order by created_at desc limit 20")
        recent = cur.fetchall()
        print(json.dumps({"users": users, "applicants": applicants, "aliases": aliases, "recent_users": recent}, indent=2, default=str))
