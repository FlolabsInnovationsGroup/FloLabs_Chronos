from pathlib import Path
import psycopg

url = 'postgresql://chronos:vBXSQMV3u8aFscRIKLFFCsBRTC7K8bUV@flolabs-chronos-db.ccxceiswgkrj.us-east-1.rds.amazonaws.com:5432/chronos?sslmode=require&connect_timeout=10'
sql_path = Path('src/lib/db/migrations/0000_classy_maximus.sql')
content = sql_path.read_text(encoding='utf-8')
statements = [s.strip() for s in content.split('--> statement-breakpoint') if s.strip()]
with psycopg.connect(url, autocommit=True) as conn:
    with conn.cursor() as cur:
        cur.execute('create extension if not exists pgcrypto;')
        for stmt in statements:
            cur.execute(stmt)
print(f'applied {len(statements)} statements')
