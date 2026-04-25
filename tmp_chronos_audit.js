const { Client } = require('pg');
const Redis = require('redis');

const dbUrl = 'postgresql://chronos:vBXSQMV3u8aFscRIKLFFCsBRTC7K8bUV@flolabs-chronos-db.ccxceiswgkrj.us-east-1.rds.amazonaws.com:5432/chronos?sslmode=require';
const redisUrl = 'redis://flolabs-chronos-redis-nfbum3.serverless.use1.cache.amazonaws.com:6379';

async function main() {
  const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const queries = {
    counts: `select (select count(*) from users) as users, (select count(*) from applicants) as applicants, (select count(*) from time_entries) as time_entries, (select count(*) from projects) as projects, (select count(*) from user_email_aliases) as aliases`,
    admins: `select email, role, is_active as "isActive", password is not null as "hasPassword" from users where lower(role) in ('admin','administrator') order by created_at asc limit 20`,
    applicant_access: `select lower(coalesce(status,'')) as status, lower(coalesce(stage,'')) as stage, count(*)::int as count from applicants group by 1,2 order by count desc limit 20`,
    timer_rows: `select count(*)::int as open_rows from time_entries where stopped_at is null`,
    recent_open: `select id, user_id, applicant_id, started_at, project_id from time_entries where stopped_at is null order by started_at desc limit 10`,
  };
  for (const [name, sql] of Object.entries(queries)) {
    const res = await client.query(sql);
    console.log(`### ${name}`);
    console.log(JSON.stringify(res.rows, null, 2));
  }
  await client.end();

  const redis = Redis.createClient({ url: redisUrl });
  redis.on('error', (e) => console.error('REDIS_ERR', e.message));
  try {
    await redis.connect();
    const keys = await redis.keys('timer:*');
    console.log('### redis_keys');
    console.log(JSON.stringify(keys, null, 2));
    if (keys.length) {
      const vals = [];
      for (const key of keys.slice(0, 10)) {
        vals.push({ key, value: await redis.get(key) });
      }
      console.log('### redis_values');
      console.log(JSON.stringify(vals, null, 2));
    }
    await redis.quit();
  } catch (e) {
    console.log('### redis_connect_failed');
    console.log(String(e && e.stack || e));
    try { await redis.quit(); } catch {}
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
