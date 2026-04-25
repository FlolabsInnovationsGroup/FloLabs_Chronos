const { Client } = require('pg');
const connectionString = process.env.DATABASE_URL;
const needsRelaxedSsl = /sslmode=require/i.test(connectionString);
const client = new Client({ connectionString, ...(needsRelaxedSsl ? { ssl: { rejectUnauthorized: false } } : {}) });
const values = [
  ['notion.apiKey', process.env.NOTION_API_KEY, true],
  ['notion.tasksDbId', process.env.NOTION_TASKS_DB_ID, false],
  ['notion.teamMembersDbId', process.env.NOTION_TEAM_MEMBERS_DB_ID, false],
  ['notion.onboardingsDbId', process.env.NOTION_ONBOARDINGS_DB_ID, false],
  ['notion.teamsDbId', process.env.NOTION_TEAMS_DB_ID, false],
  ['notion.masterClassesIndexDbId', process.env.NOTION_MASTERCLASSES_INDEX_DB_ID || '', false],
];
(async () => {
  await client.connect();
  for (const [key, value, isSecret] of values) {
    await client.query(`insert into app_config(key, value, is_secret) values($1,$2,$3) on conflict (key) do update set value = excluded.value, is_secret = excluded.is_secret, updated_at = now()`, [key, value, isSecret]);
  }
  const res = await client.query("select key, value from app_config where key like 'notion.%' order by key");
  console.log(JSON.stringify(res.rows));
  await client.end();
})().catch(async (err) => { console.error(err); try { await client.end(); } catch {} process.exit(1); });
