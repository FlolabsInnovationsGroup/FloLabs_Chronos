const fs = require('fs');
const { Client } = require('pg');

function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          q = false;
        }
      } else {
        cur += ch;
      }
    } else {
      if (ch === ',') {
        out.push(cur);
        cur = '';
      } else if (ch === '"') {
        q = true;
      } else {
        cur += ch;
      }
    }
  }
  out.push(cur);
  return out;
}

(async () => {
  const path = 'C:\\Users\\olire\\Documents\\workspace_python\\FloLabs_Hermes\\old_workflow_assets\\Time_Entries_2026-04-20\\Time Entries 297a157695518075ab6cea94e60e4220_all.csv';
  const text = fs.readFileSync(path, 'utf8').replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/).filter(Boolean);
  const header = splitCsvLine(lines[0]);
  const idx = {};
  header.forEach((h, i) => { idx[h] = i; });

  const srcIds = new Set();
  const csvProjects = new Set();
  const csvUsers = new Set();
  let emptyEntry = 0;

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    const id = String(cols[idx['Entry ID']] || '').trim();
    if (!id) {
      emptyEntry++;
      continue;
    }
    srcIds.add(id);

    const project = String(cols[idx['Project']] || '').trim();
    if (project) csvProjects.add(project);

    const user = String(cols[idx['Team Member']] || '').trim();
    if (user) csvUsers.add(user);
  }

  const client = new Client({
    host: 'flolabs-chronos-db.ccxceiswgkrj.us-east-1.rds.amazonaws.com',
    port: 5432,
    database: 'chronos',
    user: 'chronos',
    password: 'vBXSQMV3u8aFscRIKLFFCsBRTC7K8bUV',
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  const db = await client.query('select notion_page_id from time_entries where notion_page_id is not null');
  const dbIds = new Set(db.rows.map((r) => String(r.notion_page_id)));

  let matched = 0;
  const missing = [];
  for (const id of srcIds) {
    if (dbIds.has(id)) {
      matched++;
    } else if (missing.length < 20) {
      missing.push(id);
    }
  }

  const extra = [];
  for (const r of db.rows) {
    const id = String(r.notion_page_id);
    if (!srcIds.has(id) && extra.length < 20) {
      extra.push(id);
    }
  }

  const q1 = await client.query('select count(*)::int as c from users');
  const q2 = await client.query('select count(*)::int as c from projects');
  const q3 = await client.query('select count(*)::int as c from time_entries');
  const q4 = await client.query('select min(started_at) as min, max(started_at) as max from time_entries');

  console.log(JSON.stringify({
    csvDataRows: lines.length - 1,
    uniqueEntryIds: srcIds.size,
    emptyEntryIds: emptyEntry,
    dbTimeEntries: q3.rows[0].c,
    matchedIds: matched,
    missingCount: srcIds.size - matched,
    extraCount: db.rows.length - matched,
    csvDistinctProjects: csvProjects.size,
    dbProjects: q2.rows[0].c,
    csvDistinctTeamMembers: csvUsers.size,
    dbUsers: q1.rows[0].c,
    range: q4.rows[0],
    missingSample: missing,
    extraSample: extra,
  }, null, 2));

  await client.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
