import psycopg
url = 'postgresql://chronos:vBXSQMV3u8aFscRIKLFFCsBRTC7K8bUV@flolabs-chronos-db.ccxceiswgkrj.us-east-1.rds.amazonaws.com:5432/chronos?sslmode=require&connect_timeout=10'
with psycopg.connect(url) as conn:
    with conn.cursor() as cur:
        cur.execute('select current_database(), current_user')
        print(cur.fetchone())
