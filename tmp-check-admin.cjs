const { Pool } = require('pg');
(async()=>{
  const p = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const r = await p.query("select * from team_memberships where user_id = '86043cfa-3943-4783-9408-3e35a1e071e5'");
  console.log(JSON.stringify(r.rows,null,2));
  await p.end();
})().catch(e=>{ console.error(e); process.exit(1); });
