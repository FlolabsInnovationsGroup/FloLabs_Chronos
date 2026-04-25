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
  const r = await client.query("select email, password, is_active from users order by created_at asc limit 10");
  for (const row of r.rows) {
    console.log(JSON.stringify({
      email: row.email,
      isActive: row.is_active,
      passwordPrefix: typeof row.password === 'string' ? row.password.slice(0, 12) : null,
      looksBcrypt: typeof row.password === 'string' ? row.password.startsWith('$2') : false,
      passwordLength: typeof row.password === 'string' ? row.password.length : 0,
    }));
  }
  await client.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
