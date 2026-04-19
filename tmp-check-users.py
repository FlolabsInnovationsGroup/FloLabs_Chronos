import psycopg
import json

DB_URL = "postgresql://chronos:vBXSQMV3u8aFscRIKLFFCsBRTC7K8bUV@flolabs-chronos-db.ccxceiswgkrj.us-east-1.rds.amazonaws.com:5432/chronos?sslmode=require"
emails = [
  'oliver.abreu@flolabsrd.com',
  'oliver.belliardabreu@gmail.com',
  'oliver.abreu@flomadlabs.com',
  'tesororeptilipotermius@gmail.com',
  'pm@flolabsinnovations.com',
]
with psycopg.connect(DB_URL) as conn:
    with conn.cursor() as cur:
        cur.execute('''
            select u.id,u.email,u.role,u.is_active,u.team_id,
                   a.id as applicant_id,a.stage,a.status,a.role as applicant_role,a.is_active as applicant_active,
                   ua.email as alias_email
            from users u
            left join applicants a on a.chronos_user_id = u.id
            left join user_email_aliases ua on ua.user_id = u.id
            where lower(u.email) = any(%s)
               or lower(coalesce(ua.email,'')) = any(%s)
            order by u.email
        ''', ([e.lower() for e in emails], [e.lower() for e in emails]))
        cols = [d.name for d in cur.description]
        rows = [dict(zip(cols, row)) for row in cur.fetchall()]
        print(json.dumps(rows, indent=2, default=str))
