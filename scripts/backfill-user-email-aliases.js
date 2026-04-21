const { Client } = require('pg');

(async () => {
  const client = new Client({
    host: 'flolabs-chronos-db.ccxceiswgkrj.us-east-1.rds.amazonaws.com',
    port: 5432,
    database: 'chronos',
    user: 'chronos',
    password: 'vBXSQMV3u8aFscRIKLFFCsBRTC7K8bUV',
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  const ensureTable = `
    create table if not exists user_email_aliases (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references users(id) on delete cascade,
      email text not null unique,
      is_primary boolean not null default false,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `;

  const insertPrimary = `
    insert into user_email_aliases (user_id, email, is_primary)
    select u.id, lower(trim(u.email)), true
    from users u
    where nullif(trim(u.email), '') is not null
    on conflict (email) do nothing
  `;

  const insertApplicantAliases = `
    insert into user_email_aliases (user_id, email, is_primary)
    select distinct u.id, lower(trim(v.email)), case when lower(trim(v.email)) = lower(trim(u.email)) then true else false end
    from users u
    join applicants a on a.chronos_user_id = u.id
    cross join lateral jsonb_array_elements_text(coalesce(a.hubspot_raw_data->'emails', '[]'::jsonb)) as v(email)
    where nullif(trim(v.email), '') is not null
    on conflict (email) do nothing
  `;

  await client.query(ensureTable);
  const r1 = await client.query(insertPrimary);
  const r2 = await client.query(insertApplicantAliases);
  const count = await client.query('select count(*)::int as c from user_email_aliases');
  const distinctUsers = await client.query('select count(distinct user_id)::int as c from user_email_aliases');

  console.log(JSON.stringify({
    insertedPrimaryAliases: r1.rowCount,
    insertedApplicantAliases: r2.rowCount,
    totalAliases: count.rows[0].c,
    usersWithAliases: distinctUsers.rows[0].c,
  }, null, 2));

  await client.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
