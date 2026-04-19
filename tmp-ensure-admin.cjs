const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL missing');
  const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });

  const teamName = 'FloLabs Core';
  const teamSlug = 'flolabs-core';
  const email = 'pm@flolabsinnovations.com';
  const password = process.env.CHRONOS_ADMIN_PASSWORD || 'flchron2026';
  const now = new Date();

  let team = await pool.query('select id from teams where slug = $1 limit 1', [teamSlug]);
  let teamId;
  if (team.rows.length) {
    teamId = team.rows[0].id;
  } else {
    const inserted = await pool.query(
      'insert into teams (id, name, slug, created_at, updated_at) values ($1,$2,$3,$4,$4) returning id',
      [crypto.randomUUID(), teamName, teamSlug, now]
    );
    teamId = inserted.rows[0].id;
  }

  const existing = await pool.query('select id, email from users where lower(email)=lower($1) limit 1', [email]);
  if (existing.rows.length) {
    await pool.query('update users set role=$1, is_active=$2, team_id=$3, updated_at=$4 where id=$5', ['admin', true, teamId, now, existing.rows[0].id]);
    console.log(JSON.stringify({ ok: true, action: 'updated', email, teamId, password }));
  } else {
    const hash = await bcrypt.hash(password, 12);
    const id = crypto.randomUUID();
    await pool.query(
      'insert into users (id, name, email, password, role, team_id, is_active, created_at, updated_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$8)',
      [id, 'Admin', email, hash, 'admin', teamId, true, now]
    );
    console.log(JSON.stringify({ ok: true, action: 'created', email, teamId, password }));
  }

  await pool.end();
}
main().catch(err => { console.error(err); process.exit(1); });
