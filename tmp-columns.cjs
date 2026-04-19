const { Pool } = require('pg');
(async()=>{
  const p = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const r = await p.query("select column_name from information_schema.columns where table_name = 'applicants' order by ordinal_position");
  console.log(r.rows.map(x => x.column_name).join(','));
  await p.end();
})().catch(e=>{ console.error(e); process.exit(1); });
