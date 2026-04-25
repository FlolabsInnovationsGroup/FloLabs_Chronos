const { Client } = require('pg');

(async () => {
  const client = new Client({
    host: 'flolabs-chronos-db.ccxceiswgkrj.us-east-1.rds.amazonaws.com',
    port: 5432,
    database: 'chronos',
    user: 'chronos',
    password: 'vBXSQMV3u8aFscRIKLFFCsBRTC7K8bUV',
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 20000,
  });
  await client.connect();

  const summary = await client.query(`
    with eligible as (
      select id, email, name, stage, status, chronos_user_id, is_active
      from applicants
      where lower(coalesce(stage,'')) = 'joined'
         or lower(coalesce(status,'')) in ('joined','active')
    ), linked as (
      select e.*, u.id as user_id, u.email as user_email, u.is_active as user_active,
             case when u.password is not null and length(u.password) > 0 then true else false end as has_password
      from eligible e
      left join users u on u.id = e.chronos_user_id
    )
    select
      (select count(*)::int from eligible) as eligible_total,
      (select count(*)::int from linked where user_id is not null) as linked_user_count,
      (select count(*)::int from linked where user_id is null) as missing_user_count,
      (select count(*)::int from linked where user_id is not null and user_active = true and has_password = true) as login_ready_count,
      (select count(*)::int from linked where user_id is not null and (user_active is distinct from true or has_password = false)) as linked_but_not_ready_count
  `);

  const missing = await client.query(`
    with eligible as (
      select id, email, name, stage, status, chronos_user_id
      from applicants
      where lower(coalesce(stage,'')) = 'joined'
         or lower(coalesce(status,'')) in ('joined','active')
    )
    select email, name, stage, status
    from eligible
    where chronos_user_id is null
    order by email
    limit 25
  `);

  console.log(JSON.stringify({
    summary: summary.rows[0],
    missingSample: missing.rows,
  }, null, 2));

  await client.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
