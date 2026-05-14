/**
 * Merge `website_applicants_legacy` into `flolabs_users` by email, then upsert every
 * HubSpot contact row from the Hermes export CSV into `flolabs_users` (email key).
 *
 * Default CSV: ../FloLabs_Hermes/old_workflow_assets/all-contacts_2026-04-12.csv
 *
 *   pnpm exec tsx scripts/merge-legacy-and-hubspot-csv-contacts.ts --dry-run
 *   pnpm exec tsx scripts/merge-legacy-and-hubspot-csv-contacts.ts --csv-path=C:\\path\\contacts.csv
 *   HUBSPOT_CSV_MAX_ROWS=5000 pnpm exec tsx scripts/merge-legacy-and-hubspot-csv-contacts.ts
 *   HUBSPOT_CSV_BATCH=250 (default 200) — rows per multi-value upsert for speed
 *   HUBSPOT_CSV_SKIP_EMAILS=a@b.com,c@d.com — skip these emails entirely during CSV upsert
 *
 * Env: DATABASE_URL / FL_CHRONOS_* (see scripts/db-utils.ts).
 */
import { createReadStream } from "node:fs";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { parse as csvParse } from "csv-parse";
import bcrypt from "bcryptjs";
import type { PoolClient } from "pg";
import { createMigrationPool, loadEnvFiles } from "./db-utils";

loadEnvFiles([".env.local", ".env.production.local"]);

const dryRun = process.argv.includes("--dry-run");
const csvArg = process.argv.find((a) => a.startsWith("--csv-path="));
const defaultCsv = resolve(process.cwd(), "..", "FloLabs_Hermes", "old_workflow_assets", "all-contacts_2026-04-12.csv");
const csvPath = csvArg ? csvArg.split("=").slice(1).join("=").replace(/^["']|["']$/g, "") : defaultCsv;
const maxRows = Number(process.env.HUBSPOT_CSV_MAX_ROWS ?? 0); // 0 = unlimited

/** Emails we never insert as brand-new rows from HubSpot CSV (avoids overwriting access with a random placeholder hash). */
const csvSkipEmails = new Set(
  String(
    process.env.HUBSPOT_CSV_SKIP_EMAILS ??
      "zoom@flomadlabs.com,oliver.abreu@flolabsrd.com,pm@flolabsinnovations.com,tesororeptilipotermius@gmail.com",
  )
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
);

function cell(row: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

function emailOk(e: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

function normalizeCsvRow(row: Record<string, string>) {
  const email = cell(row, "Email", "email").toLowerCase();
  if (!emailOk(email)) return null;
  const first = cell(row, "First Name", "First name");
  const last = cell(row, "Last Name", "Last name");
  const combined = [first, last].filter(Boolean).join(" ").trim();
  const fallbackName = cell(row, "First and Last Name", "First and last name");
  const name = (combined || fallbackName || email.split("@")[0] || "Contact").trim();
  return {
    email,
    name,
    firstName: first,
    lastName: last,
    hubspotRecordId: cell(row, "Record ID", "record id") || null,
    lifecycleStage: cell(row, "Lifecycle Stage", "Lifecycle stage") || null,
    leadStatus: cell(row, "Lead Status", "Lead status") || null,
    companyName: cell(row, "Company Name", "Company name") || null,
    phone: cell(row, "Phone Number", "Mobile Phone Number", "WhatsApp Phone Number") || null,
    linkedin: cell(row, "LinkedIn URL", "Linkedin URL", "Linkedin account") || null,
    country: cell(row, "Country/Region", "Country", "IP Country") || null,
    city: cell(row, "City", "IP City", "Candidate Location") || null,
  };
}

async function ensureColumns(client: PoolClient) {
  const stmts = [
    `alter table flolabs_users add column if not exists company_name text`,
    `alter table flolabs_users add column if not exists hubspot_record_id text`,
    `alter table flolabs_users add column if not exists hubspot_lifecycle_stage text`,
    `alter table flolabs_users add column if not exists hubspot_lead_status text`,
  ];
  for (const s of stmts) {
    if (dryRun) console.log("[dry-run] skip:", s);
    else await client.query(s);
  }
}

async function mergeLegacyApplicants(client: PoolClient) {
  const { rows } = await client.query<{ exists: boolean }>(
    `select exists(
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = 'website_applicants_legacy'
    ) as exists`,
  );
  if (!rows[0]?.exists) {
    console.log("No website_applicants_legacy table — skip legacy merge.");
    return;
  }

  const { rows: colRows } = await client.query<{ column_name: string }>(
    `select column_name from information_schema.columns
     where table_schema = 'public' and table_name = 'website_applicants_legacy'`,
  );
  const cols = new Set(colRows.map((r) => r.column_name));
  const r = (c: string, fallbackSql: string) => (cols.has(c) ? `l.${c}` : fallbackSql);

  const nameExpr = cols.has("name")
    ? `coalesce(nullif(trim(l.name), ''), nullif(trim(concat_ws(' ', nullif(trim(l.first_name), ''), nullif(trim(l.last_name), ''))), ''), lower(trim(l.email)))`
    : `coalesce(nullif(trim(concat_ws(' ', nullif(trim(l.first_name), ''), nullif(trim(l.last_name), ''))), ''), lower(trim(l.email)))`;

  const roleExpr = cols.has("role")
    ? `coalesce(nullif(trim(l.role), ''), 'applicant'::text)`
    : `'applicant'::text`;
  const stageExpr = cols.has("stage")
    ? `coalesce(nullif(trim(l.stage), ''), 'application_submitted'::text)`
    : `'application_submitted'::text`;
  const statusExpr = cols.has("status")
    ? `coalesce(nullif(trim(l.status), ''), 'applying'::text)`
    : `'applying'::text`;
  const joinedExpr = cols.has("joined_at") ? `l.joined_at` : `now()`;
  const lastVisitExpr = cols.has("last_visited_at") ? `l.last_visited_at` : `now()`;
  const createdExpr = cols.has("created_at") ? `l.created_at` : `now()`;

  const sql = `
    insert into flolabs_users (
      id, email, password, name, role, is_active, hr_binary_role,
      first_name, last_name, phone_number, country, state_region, city,
      latitude, longitude, linkedin_url, education, source, referral_name,
      cv_file_name, cv_url, profile_picture_url, role_applied_for, stage, status,
      joined_at, last_visited_at, notes, safe_senders_confirmed, communication_consent,
      created_at, updated_at
    )
    select
      l.id,
      lower(trim(l.email)),
      l.password,
      ${nameExpr},
      ${roleExpr},
      ${cols.has("is_active") ? "coalesce(l.is_active, true)" : "true"},
      ${cols.has("hr_binary_role") ? "coalesce(l.hr_binary_role, false)" : "false"},
      coalesce(${r("first_name", "null::text")}, ''),
      coalesce(${r("last_name", "null::text")}, ''),
      ${r("phone_number", "null::text")},
      ${r("country", "null::text")},
      ${r("state_region", "null::text")},
      ${r("city", "null::text")},
      ${r("latitude", "null::double precision")},
      ${r("longitude", "null::double precision")},
      ${r("linkedin_url", "null::text")},
      ${r("education", "null::text")},
      ${r("source", "null::text")},
      ${r("referral_name", "null::text")},
      ${r("cv_file_name", "null::text")},
      ${r("cv_url", "null::text")},
      ${r("profile_picture_url", "null::text")},
      ${r("role_applied_for", "null::text")},
      ${stageExpr},
      ${statusExpr},
      ${joinedExpr},
      ${lastVisitExpr},
      ${r("notes", "null::text")},
      coalesce(${r("safe_senders_confirmed", "false")}, false),
      coalesce(${r("communication_consent", "false")}, false),
      ${createdExpr},
      now()
    from website_applicants_legacy l
    where not exists (
      select 1 from flolabs_users f where lower(trim(f.email)) = lower(trim(l.email))
    )
  `;
  if (dryRun) {
    console.log("[dry-run] skip legacy INSERT…SELECT (see script source).");
    return;
  }
  const ins = await client.query(sql);
  console.log(`Legacy merge: inserted ${ins.rowCount ?? 0} rows from website_applicants_legacy.`);

  const phoneL = cols.has("phone_number") ? "l.phone_number" : "null::text";
  const countryL = cols.has("country") ? "l.country" : "null::text";
  const cityL = cols.has("city") ? "l.city" : "null::text";
  const liL = cols.has("linkedin_url") ? "l.linkedin_url" : "null::text";
  const eduL = cols.has("education") ? "l.education" : "null::text";
  const rafL = cols.has("role_applied_for") ? "l.role_applied_for" : "null::text";
  const notesL = cols.has("notes") ? "l.notes" : "null::text";

  const upd = `
    update flolabs_users f set
      phone_number = coalesce(nullif(trim(f.phone_number), ''), nullif(trim(${phoneL}), '')),
      country = coalesce(nullif(trim(f.country), ''), nullif(trim(${countryL}), '')),
      city = coalesce(nullif(trim(f.city), ''), nullif(trim(${cityL}), '')),
      linkedin_url = coalesce(nullif(trim(f.linkedin_url), ''), nullif(trim(${liL}), '')),
      education = coalesce(nullif(trim(f.education), ''), nullif(trim(${eduL}), '')),
      role_applied_for = coalesce(nullif(trim(f.role_applied_for), ''), nullif(trim(${rafL}), '')),
      notes = case when length(coalesce(${notesL},'')) > length(coalesce(f.notes,'')) then ${notesL} else f.notes end,
      updated_at = now()
    from website_applicants_legacy l
    where lower(trim(f.email)) = lower(trim(l.email))
  `;
  const u = await client.query(upd);
  console.log(`Legacy enrich: updated ${u.rowCount ?? 0} existing flolabs_users rows from legacy.`);
}

const UPSERT_ON_CONFLICT = `
  on conflict (email) do update set
    name = case
      when length(trim(excluded.name)) > length(trim(coalesce(flolabs_users.name, ''))) then excluded.name
      else flolabs_users.name
    end,
    first_name = case
      when length(trim(coalesce(excluded.first_name, ''))) > length(trim(coalesce(flolabs_users.first_name, '')))
        then excluded.first_name
      else flolabs_users.first_name
    end,
    last_name = case
      when length(trim(coalesce(excluded.last_name, ''))) > length(trim(coalesce(flolabs_users.last_name, '')))
        then excluded.last_name
      else flolabs_users.last_name
    end,
    hubspot_record_id = coalesce(excluded.hubspot_record_id, flolabs_users.hubspot_record_id),
    hubspot_lifecycle_stage = coalesce(excluded.hubspot_lifecycle_stage, flolabs_users.hubspot_lifecycle_stage),
    hubspot_lead_status = coalesce(excluded.hubspot_lead_status, flolabs_users.hubspot_lead_status),
    company_name = coalesce(excluded.company_name, flolabs_users.company_name),
    phone_number = coalesce(excluded.phone_number, flolabs_users.phone_number),
    linkedin_url = coalesce(excluded.linkedin_url, flolabs_users.linkedin_url),
    country = coalesce(excluded.country, flolabs_users.country),
    city = coalesce(excluded.city, flolabs_users.city),
    source = case
      when flolabs_users.source is null or trim(flolabs_users.source) = '' then excluded.source
      else flolabs_users.source
    end,
    updated_at = now()
`;

const CSV_BATCH = Math.max(1, Math.min(500, Number(process.env.HUBSPOT_CSV_BATCH ?? 200) || 200));

function buildCsvBatchUpsert(batch: NonNullable<ReturnType<typeof normalizeCsvRow>>[], pwd: string) {
  const colsPerRow = 13;
  const valueRows: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  for (const p of batch) {
    const placeholders = Array.from({ length: colsPerRow }, () => `$${i++}`).join(", ");
    valueRows.push(`(${placeholders})`);
    params.push(
      p.email,
      p.name,
      pwd,
      p.firstName,
      p.lastName,
      p.hubspotRecordId,
      p.lifecycleStage,
      p.leadStatus,
      p.companyName,
      p.phone,
      p.linkedin,
      p.country,
      p.city,
    );
  }
  const text = `
    insert into flolabs_users (
      email, name, password, role, first_name, last_name,
      hubspot_record_id, hubspot_lifecycle_stage, hubspot_lead_status,
      company_name, phone_number, linkedin_url, country, city,
      stage, status, source, updated_at
    )
    select v.email, v.name, v.password, 'applicant'::text, v.first_name, v.last_name,
      v.hubspot_record_id, v.hubspot_lifecycle_stage, v.hubspot_lead_status,
      v.company_name, v.phone_number, v.linkedin_url, v.country, v.city,
      'application_submitted'::text, 'applying'::text, 'hubspot_csv'::text, now()
    from (values
      ${valueRows.join(",\n")}
    ) as v(
      email, name, password, first_name, last_name,
      hubspot_record_id, hubspot_lifecycle_stage, hubspot_lead_status,
      company_name, phone_number, linkedin_url, country, city
    )
    ${UPSERT_ON_CONFLICT}
  `;
  return { text, params };
}

async function upsertCsvBatch(client: PoolClient, batch: NonNullable<ReturnType<typeof normalizeCsvRow>>[], pwd: string) {
  if (batch.length === 0) return;
  const { text, params } = buildCsvBatchUpsert(batch, pwd);
  await client.query(text, params);
}

async function streamHubspotCsv(client: PoolClient, path: string, pwd: string) {
  const parser = createReadStream(path).pipe(
    csvParse({
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
      bom: true,
    }),
  );

  let n = 0;
  let skipped = 0;
  const buf: NonNullable<ReturnType<typeof normalizeCsvRow>>[] = [];
  const flush = async () => {
    if (dryRun || buf.length === 0) return;
    await upsertCsvBatch(client, buf.splice(0, buf.length), pwd);
  };

  for await (const row of parser as AsyncIterable<Record<string, string>>) {
    const p = normalizeCsvRow(row);
    if (!p) {
      skipped += 1;
      continue;
    }
    if (csvSkipEmails.has(p.email)) {
      skipped += 1;
      continue;
    }
    if (dryRun) {
      n += 1;
      if (n <= 3) console.log("[dry-run] would upsert", p.email);
    } else {
      buf.push(p);
      if (buf.length >= CSV_BATCH) await flush();
      n += 1;
    }
    if (maxRows > 0 && n >= maxRows) {
      console.log(`Stopped at HUBSPOT_CSV_MAX_ROWS=${maxRows}`);
      break;
    }
    if (!dryRun && n % 2000 === 0) console.log(`CSV upsert progress: ${n}…`);
  }
  if (!dryRun) await flush();
  console.log(`CSV: processed ${n} rows, skipped (no email) ${skipped}.`);
}

async function main() {
  const pool = createMigrationPool();
  const client = await pool.connect();
  try {
    console.log(dryRun ? "merge-legacy-and-hubspot-csv-contacts (DRY RUN)" : "merge-legacy-and-hubspot-csv-contacts (LIVE)");
    console.log("CSV path:", csvPath);
    if (!dryRun) console.log("CSV batch size:", CSV_BATCH);

    if (dryRun) {
      await ensureColumns(client);
      await mergeLegacyApplicants(client);
      await streamHubspotCsv(client, csvPath, "");
      return;
    }

    await ensureColumns(client);
    await client.query("BEGIN");
    try {
      await mergeLegacyApplicants(client);
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }

    const pwd = await bcrypt.hash(randomBytes(24).toString("hex"), 10);
    await streamHubspotCsv(client, csvPath, pwd);
    console.log("Done.");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
