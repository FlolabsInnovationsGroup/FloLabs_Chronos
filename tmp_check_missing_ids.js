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

  const ids = [
    '4192560722','4130525867','4059397942','4240700067','4256022133','4256022139',
    '4256022106','4286539584','4297376073','4297854368','4312347566','4332634576'
  ];

  const quoted = ids.map((id) => `'${id}'`).join(', ');
  const q = `select notion_page_id, description, started_at from time_entries where notion_page_id in (${quoted}) order by notion_page_id, started_at`;
  const r = await client.query(q);
  console.log(JSON.stringify(r.rows, null, 2));

  await client.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
