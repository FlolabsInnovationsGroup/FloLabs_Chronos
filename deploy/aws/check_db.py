import psycopg

DB_URL = "postgresql://chronos:vBXSQMV3u8aFscRIKLFFCsBRTC7K8bUV@flolabs-chronos-db.ccxceiswgkrj.us-east-1.rds.amazonaws.com:5432/chronos?sslmode=require"

with psycopg.connect(DB_URL) as conn:
    with conn.cursor() as cur:
        cur.execute("select table_name from information_schema.tables where table_schema='public' order by table_name")
        for row in cur.fetchall():
            print(row[0])
