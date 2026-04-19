const { Pool } = require('pg');
(async()=>{
  const p = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const emails = [
    'oliver.abreu@flolabsrd.com',
    'oliver.belliardabreu@gmail.com',
    'oliver.abreu@flomadlabs.com',
    'tesororeptilipotermius@gmail.com',
    'pm@flolabsinnovations.com'
  ];
  const r = await p.query(`
    select u.id,u.email,u.role,u.is_active,u.team_id,u.password,
           a.id as applicant_id,a.stage,a.status,a.role as applicant_role,a.is_active as applicant_active,
           ua.email as alias_email
    from users u
    left join applicants a on a.chronos_user_id = u.id
    left join user_email_aliases ua on ua.user_id = u.id
    where lower(u.email) = any($1)
       or lower(ua.email) = any($1)
    order by u.email
  `, [emails.map(e => e.toLowerCase())]);
  console.log(JSON.stringify(r.rows,null,2));
  await p.end();
})().catch(e=>{ console.error(e); process.exit(1); });
