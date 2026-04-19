const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto');

const args = process.argv.slice(2);
const csvArg = args.find((arg) => arg.startsWith('--csv='));
const dryRun = args.includes('--dry-run');
const batchSizeArg = args.find((arg) => arg.startsWith('--batch-size='));
const batchSize = batchSizeArg ? Number(batchSizeArg.slice('--batch-size='.length)) : 500;
const csvPath = csvArg
  ? csvArg.slice('--csv='.length)
  : path.resolve(__dirname, '..', '..', 'FloLabs_Hermes', 'old_workflow_assets', 'Time_Entries_2026-04-20', 'Time Entries 297a157695518075ab6cea94e60e4220_all.csv');

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line || /^\s*#/.test(line)) continue;
    const idx = line.indexOf('=');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadEnv(path.resolve(__dirname, '..', '.env.local'));
loadEnv(path.resolve(__dirname, '..', '.env.production.local'));

const connectionString = process.env.DATABASE_URL || process.env.FL_CHRONOS_DATABASE_URL || process.env.FL_CHRONOS_DATABASE_URL_UNPOOLED;
if (!connectionString) throw new Error('DATABASE_URL is not set');
if (!fs.existsSync(csvPath)) throw new Error(`CSV file not found: ${csvPath}`);

function psql(sql) {
  return execFileSync('docker', ['run', '--rm', 'postgres:16', 'psql', connectionString, '-At', '-F', '\t', '-c', sql], { encoding: 'utf8', maxBuffer: 1024 * 1024 * 100 });
}
function parseTable(text, columns) {
  const trimmed = text.trim();
  if (!trimmed) return [];
  return trimmed.split(/\r?\n/).filter(Boolean).map((line) => {
    const parts = line.split('\t');
    const out = {};
    columns.forEach((col, i) => { out[col] = parts[i] ?? ''; });
    return out;
  });
}
function sqlLiteral(value) { if (value === null || value === undefined) return 'NULL'; return `'${String(value).replace(/'/g, "''")}'`; }
function slugify(value) { return value.normalize('NFKD').replace(/[^\x00-\x7F]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'team'; }
function extractNotionPageId(value) { const m = value.match(/-([0-9a-f]{32})(?:\?|\)|$)/i) || value.match(/([0-9a-f]{32})(?:\?|\)|$)/i); return m ? m[1].toLowerCase() : null; }
function parseDateRange(range) {
  if (!range || !range.trim()) return { startedAt: null, stoppedAt: null };
  const parts = range.split('→').map((part) => part.trim());
  if (parts.length !== 2) return { startedAt: null, stoppedAt: null };
  const startMatch = parts[0].match(/^(.+?)\s+\((GMT[+-]\d+)\)$/i);
  if (!startMatch) return { startedAt: null, stoppedAt: null };
  const startBase = startMatch[1].trim();
  const offset = startMatch[2].toUpperCase().replace('GMT', '');
  const startedAt = new Date(`${startBase} ${offset}`);
  if (Number.isNaN(startedAt.getTime())) return { startedAt: null, stoppedAt: null };
  let stoppedAt = new Date(`${parts[1]} ${offset}`);
  if (Number.isNaN(stoppedAt.getTime())) {
    const dayPrefix = startBase.match(/^([A-Za-z]+ \d{1,2}, \d{4})\s+/)?.[1];
    if (!dayPrefix) return { startedAt: null, stoppedAt: null };
    stoppedAt = new Date(`${dayPrefix} ${parts[1]} ${offset}`);
  }
  if (Number.isNaN(stoppedAt.getTime())) return { startedAt: null, stoppedAt: null };
  if (stoppedAt.getTime() < startedAt.getTime()) stoppedAt = new Date(stoppedAt.getTime() + 24 * 60 * 60 * 1000);
  return { startedAt, stoppedAt };
}
function parseCsv(text) {
  const rows = []; let row = []; let current = ''; let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') { if (text[i + 1] === '"') { current += '"'; i++; } else inQuotes = false; } else current += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { row.push(current.replace(/\r$/, '')); current = ''; }
    else if (ch === '\n') { row.push(current.replace(/\r$/, '')); rows.push(row); row = []; current = ''; }
    else current += ch;
  }
  if (current.length || row.length) { row.push(current.replace(/\r$/, '')); rows.push(row); }
  const [header, ...data] = rows;
  return data.filter((r) => r.some((cell) => cell.trim())).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] || ''])));
}
function makeImportedEmail(name, notionId) { const local = slugify(name || notionId || crypto.randomUUID()); return `${local || 'imported'}@imported.local`; }

const rows = parseCsv(fs.readFileSync(csvPath, 'utf8'));
console.log(`Loaded ${rows.length} CSV rows from ${csvPath}`);
console.log(`Mode: ${dryRun ? 'dry-run' : 'live import'} | batch size ${batchSize}`);

const users = parseTable(psql("select id, email, name, coalesce(notion_team_member_id,''), coalesce(team_id::text,'') from users"), ['id','email','name','notion_team_member_id','team_id']);
const teams = parseTable(psql("select id, name, slug from teams"), ['id','name','slug']);
const projects = parseTable(psql("select id, name from projects"), ['id','name']);
const existingEntries = new Set(parseTable(psql("select coalesce(notion_page_id,'') from time_entries where notion_page_id is not null"), ['notion_page_id']).map((r) => r.notion_page_id.toLowerCase()));
const admin = users.find((u) => u.email.toLowerCase() === 'pm@flolabsinnovations.com');
if (!admin) throw new Error('Admin user not found');

const userByNotionId = new Map(users.filter((u) => u.notion_team_member_id).map((u) => [u.notion_team_member_id.toLowerCase(), u]));
const userByName = new Map(users.map((u) => [u.name.trim().toLowerCase(), u]));
const teamByName = new Map(teams.map((t) => [t.name.toLowerCase(), t]));
const projectByName = new Map(projects.map((p) => [p.name.toLowerCase(), p]));

let insertedUsers = 0, insertedTeams = 0, insertedProjects = 0, insertedEntries = 0, insertedTags = 0, skippedExisting = 0, skippedInvalid = 0;

function ensureImportedUser(teamMemberName, userKey, notionPageId, teamMemberNotionId) {
  let user = (teamMemberNotionId ? userByNotionId.get(teamMemberNotionId) : undefined) || (teamMemberName ? userByName.get(teamMemberName.toLowerCase()) : undefined) || (userKey ? userByName.get(userKey.toLowerCase()) : undefined) || null;
  if (user) return user;
  const baseName = teamMemberName || userKey || `Imported User ${notionPageId}`;
  const teamName = 'Imported Team';
  let team = teamByName.get(teamName.toLowerCase()) || null;
  if (!team) {
    if (!dryRun) team = parseTable(psql(`insert into teams (name, slug) values (${sqlLiteral(teamName)}, ${sqlLiteral(slugify(teamName))}) returning id, name, slug`), ['id','name','slug'])[0];
    else team = { id: 'dry-run-team', name: teamName, slug: slugify(teamName) };
    teamByName.set(teamName.toLowerCase(), team); insertedTeams++;
  }
  if (!dryRun) {
    user = parseTable(psql(`insert into users (email, name, password, role, team_id, is_active, notion_team_member_id) values (${sqlLiteral(makeImportedEmail(baseName, notionPageId))}, ${sqlLiteral(baseName)}, 'imported-not-login-enabled', 'member', ${sqlLiteral(team.id)}, true, ${sqlLiteral(teamMemberNotionId)}) returning id, email, name, coalesce(notion_team_member_id,''), coalesce(team_id::text,'')`), ['id','email','name','notion_team_member_id','team_id'])[0];
  } else {
    user = { id: `dry-run-user-${insertedUsers+1}`, email: makeImportedEmail(baseName, notionPageId), name: baseName, notion_team_member_id: teamMemberNotionId || '', team_id: team.id };
  }
  if (teamMemberNotionId) userByNotionId.set(teamMemberNotionId, user);
  userByName.set(user.name.trim().toLowerCase(), user); insertedUsers++; return user;
}
function ensureProject(projectName) {
  let project = projectByName.get(projectName.toLowerCase()) || null;
  if (project) return project;
  if (!dryRun) project = parseTable(psql(`insert into projects (name, created_by_id) values (${sqlLiteral(projectName)}, ${sqlLiteral(admin.id)}) returning id, name`), ['id','name'])[0];
  else project = { id: `dry-run-project-${insertedProjects+1}`, name: projectName };
  projectByName.set(projectName.toLowerCase(), project); insertedProjects++; return project;
}

const prepared = [];
for (const row of rows) {
  const notionPageId = (row['Entry ID'] || '').trim();
  if (!notionPageId) { skippedInvalid++; continue; }
  if (existingEntries.has(notionPageId.toLowerCase())) { skippedExisting++; continue; }
  const userKey = (row['User Key'] || '').trim();
  const teamMemberCell = (row['Team Member'] || '').trim();
  const teamMemberName = teamMemberCell.replace(/\s*\(https?:\/\/[^)]*\)\s*$/, '').trim();
  const teamMemberNotionId = extractNotionPageId(teamMemberCell || '');
  const projectName = (row['Project'] || '').trim() || 'Imported';
  const description = (row['Description'] || '').trim() || 'Imported entry';
  const durationSeconds = Number(row['Duration'] || '0');
  const { startedAt, stoppedAt } = parseDateRange(row['Date'] || '');
  if (!startedAt || !stoppedAt || !Number.isFinite(durationSeconds) || durationSeconds <= 0) { skippedInvalid++; continue; }
  const user = ensureImportedUser(teamMemberName, userKey, notionPageId, teamMemberNotionId);
  const project = ensureProject(projectName);
  prepared.push({
    notionPageId, userId: user.id, projectId: project.id, description,
    startedAt: startedAt.toISOString(), stoppedAt: stoppedAt.toISOString(), durationMs: Math.round(durationSeconds * 1000),
    taskPageId: extractNotionPageId(row['Task'] || ''),
    taskTitle: (row['Task'] || '').replace(/\s*\(https?:\/\/[^)]*\)\s*$/, '').trim() || null,
    tags: (row['Tags'] || '').split(',').map((t) => t.trim()).filter(Boolean),
  });
}

for (let i = 0; i < prepared.length; i += batchSize) {
  const batch = prepared.slice(i, i + batchSize);
  if (!dryRun) {
    const values = batch.map((e) => `(${sqlLiteral(e.userId)}, ${sqlLiteral(e.projectId)}, ${sqlLiteral(e.description)}, ${sqlLiteral(e.startedAt)}, ${sqlLiteral(e.stoppedAt)}, ${e.durationMs}, ${sqlLiteral(e.notionPageId)}, ${sqlLiteral(e.taskPageId)}, ${sqlLiteral(e.taskTitle)}, now())`).join(',\n');
    psql(`insert into time_entries (user_id, project_id, description, started_at, stopped_at, duration_ms, notion_page_id, notion_task_page_id, notion_task_title, synced_at) values ${values} on conflict do nothing`);
    for (const e of batch) {
      if (e.tags.length === 0) continue;
      const entryId = parseTable(psql(`select id from time_entries where notion_page_id = ${sqlLiteral(e.notionPageId)} limit 1`), ['id'])[0]?.id;
      if (!entryId) continue;
      for (const tagName of e.tags) {
        let tagId = parseTable(psql(`select id from tags where user_id = ${sqlLiteral(e.userId)} and lower(name) = lower(${sqlLiteral(tagName)})`), ['id'])[0]?.id;
        if (!tagId) {
          const created = parseTable(psql(`insert into tags (name, user_id) values (${sqlLiteral(tagName)}, ${sqlLiteral(e.userId)}) on conflict (name, user_id) do nothing returning id`), ['id'])[0]?.id;
          tagId = created || parseTable(psql(`select id from tags where user_id = ${sqlLiteral(e.userId)} and lower(name) = lower(${sqlLiteral(tagName)})`), ['id'])[0]?.id;
          if (created) insertedTags++;
        }
        if (tagId) psql(`insert into time_entry_tags (time_entry_id, tag_id) values (${sqlLiteral(entryId)}, ${sqlLiteral(tagId)}) on conflict do nothing`);
      }
    }
  }
  insertedEntries += batch.length;
  console.log(`Processed ${insertedEntries}/${prepared.length} entries...`);
}

console.log('Import summary');
console.log(`  Users created: ${insertedUsers}`);
console.log(`  Teams created: ${insertedTeams}`);
console.log(`  Projects created: ${insertedProjects}`);
console.log(`  Entries inserted: ${insertedEntries}`);
console.log(`  Tags created: ${insertedTags}`);
console.log(`  Skipped existing: ${skippedExisting}`);
console.log(`  Skipped invalid: ${skippedInvalid}`);
