/**
 * 1) Match flolabs_users with @imported.local primary email to HubSpot CSV contacts.
 * 2) Set real primary email from CSV; remove @imported.local from aliases.
 * 3) Backfill empty profile fields (phone, city, country, linkedin, names, HubSpot ids) from CSV.
 *
 *   pnpm exec tsx scripts/repair-imported-local-from-hubspot-csv.ts --dry-run
 *   pnpm exec tsx scripts/repair-imported-local-from-hubspot-csv.ts
 *
 * Env: DATABASE_URL / FL_CHRONOS_* (see scripts/db-utils.ts).
 */
import { createReadStream } from "node:fs";
import { resolve } from "node:path";
import { parse as csvParse } from "csv-parse";
import type { PoolClient } from "pg";
import { createMigrationPool, loadEnvFiles } from "./db-utils";

loadEnvFiles([".env.local", ".env.production.local"]);

const dryRun = process.argv.includes("--dry-run");
const closePlaceholders = process.argv.includes("--close-placeholders");
const csvArg = process.argv.find((a) => a.startsWith("--csv-path="));
const defaultCsv = resolve(process.cwd(), "..", "FloLabs_Hermes", "old_workflow_assets", "all-contacts_2026-04-12.csv");
const csvPath = csvArg ? csvArg.split("=").slice(1).join("=").replace(/^["']|["']$/g, "") : defaultCsv;

type CsvContact = {
  email: string;
  emails: string[];
  name: string;
  firstName: string;
  lastName: string;
  nameKey: string;
  hubspotRecordId: string | null;
  lifecycleStage: string | null;
  leadStatus: string | null;
  companyName: string | null;
  phone: string | null;
  linkedin: string | null;
  country: string | null;
  city: string | null;
  stateRegion: string | null;
  education: string | null;
};

type DbUser = {
  id: string;
  email: string;
  name: string;
  first_name: string | null;
  last_name: string | null;
  phone_number: string | null;
  linkedin_url: string | null;
  city: string | null;
  country: string | null;
  state_region: string | null;
  education: string | null;
  hubspot_record_id: string | null;
  company_name: string | null;
  notion_team_member_id: string | null;
  status: string | null;
  role: string | null;
};

function cell(row: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

function isImportedLocal(email: string) {
  return email.toLowerCase().includes("@imported.local");
}

function emailOk(e: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && !isImportedLocal(e);
}

function stripDiacritics(value: string) {
  return value.normalize("NFKD").replace(/\p{M}/gu, "");
}

function slugify(value: string) {
  return stripDiacritics(value)
    .toLowerCase()
    .replace(/[''"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeNameKey(name: string) {
  return stripDiacritics(name)
    .replace(/\s*—\s*\d{4}-\d{2}-\d{2}\s*$/u, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function importedEmailSlug(email: string) {
  const local = email.split("@")[0] ?? "";
  return local.replace(/-\d{4}-\d{2}-\d{2}$/, "");
}

function displayNameFromDb(row: Pick<DbUser, "name" | "first_name" | "last_name">) {
  const fromParts = [row.first_name, row.last_name].map((v) => String(v ?? "").trim()).filter(Boolean).join(" ");
  const raw = String(row.name ?? "").trim() || fromParts;
  return normalizeNameKey(raw.replace(/\s*—\s*\d{4}-\d{2}-\d{2}\s*$/u, "").trim());
}

function parseEmailList(raw: string): string[] {
  if (!raw) return [];
  return Array.from(
    new Set(
      raw
        .split(/[,;]/)
        .map((p) => p.trim().toLowerCase())
        .filter((e) => emailOk(e)),
    ),
  );
}

function normalizeCsvRow(row: Record<string, string>): CsvContact | null {
  const primary = cell(row, "Email", "email").toLowerCase();
  const work = cell(row, "Work email").toLowerCase();
  const additional = parseEmailList(cell(row, "Additional email addresses"));
  const emails = Array.from(
    new Set([primary, work, ...additional].filter((e) => emailOk(e))),
  );
  const email = emails[0];
  if (!email) return null;

  const first = cell(row, "First Name", "First name");
  const last = cell(row, "Last Name", "Last name");
  const combined = [first, last].filter(Boolean).join(" ").trim();
  const fallbackName = cell(row, "First and Last Name", "First and last name");
  const name = (combined || fallbackName || email.split("@")[0] || "Contact").trim();
  const nameKey = normalizeNameKey(combined || fallbackName || name);

  return {
    email,
    emails,
    name,
    firstName: first,
    lastName: last,
    nameKey,
    hubspotRecordId: cell(row, "Record ID", "record id") || null,
    lifecycleStage: cell(row, "Lifecycle Stage", "Lifecycle stage") || null,
    leadStatus: cell(row, "Lead Status", "Lead status") || null,
    companyName: cell(row, "Company Name", "Company name") || null,
    phone: cell(row, "Phone Number", "Mobile Phone Number", "WhatsApp Phone Number") || null,
    linkedin: cell(row, "LinkedIn URL", "Linkedin URL", "Linkedin account") || null,
    country: cell(row, "Country/Region", "Country", "IP Country") || null,
    city: cell(row, "City", "IP City", "Candidate Location") || null,
    stateRegion: cell(row, "State/Region", "State/Region Code", "IP State/Region") || null,
    education: cell(row, "Education", "Degree", "Field of study") || null,
  };
}

async function loadCsvIndex() {
  const byRecordId = new Map<string, CsvContact>();
  const byEmail = new Map<string, CsvContact>();
  const byNameKey = new Map<string, CsvContact[]>();
  const bySlug = new Map<string, CsvContact[]>();

  let rowCount = 0;
  let parsed = 0;

  await new Promise<void>((resolvePromise, reject) => {
    createReadStream(csvPath)
      .pipe(csvParse({ columns: true, skip_empty_lines: true, relax_column_count: true }))
      .on("data", (row: Record<string, string>) => {
        rowCount++;
        const contact = normalizeCsvRow(row);
        if (!contact) return;
        parsed++;
        if (contact.hubspotRecordId) byRecordId.set(contact.hubspotRecordId, contact);
        for (const e of contact.emails) {
          if (!byEmail.has(e)) byEmail.set(e, contact);
        }
        const list = byNameKey.get(contact.nameKey) ?? [];
        list.push(contact);
        byNameKey.set(contact.nameKey, list);
        const slug = slugify([contact.firstName, contact.lastName].filter(Boolean).join(" ") || contact.name);
        if (slug) {
          const slugList = bySlug.get(slug) ?? [];
          slugList.push(contact);
          bySlug.set(slug, slugList);
        }
      })
      .on("error", reject)
      .on("end", () => resolvePromise());
  });

  console.log(`CSV: ${rowCount} row(s), ${parsed} with usable email(s).`);
  console.log(`Index: ${byRecordId.size} record ids, ${byEmail.size} emails, ${byNameKey.size} name keys.`);
  return { byRecordId, byEmail, byNameKey, bySlug };
}

function pickUniqueContact(hits: CsvContact[], hubspotRecordId: string | null) {
  if (hits.length === 0) return null;
  if (hits.length === 1) return hits[0]!;
  if (hubspotRecordId) {
    const filtered = hits.filter((h) => h.hubspotRecordId === hubspotRecordId);
    if (filtered.length === 1) return filtered[0]!;
  }
  const withEmail = hits.filter((h) => h.emails.length > 0);
  if (withEmail.length === 1) return withEmail[0]!;
  return null;
}

function nameTokensFromKey(nameKey: string) {
  const stripped = nameKey.replace(/[''"]/g, "").replace(/[()]/g, " ");
  return stripped.split(/\s+/).map((t) => t.trim()).filter(Boolean);
}

function findCsvForImportedUser(
  user: DbUser,
  indexes: Awaited<ReturnType<typeof loadCsvIndex>>,
): CsvContact | null {
  const { byRecordId, byEmail, byNameKey, bySlug } = indexes;
  if (user.hubspot_record_id) {
    const hit = byRecordId.get(user.hubspot_record_id);
    if (hit) return hit;
  }
  const nameKey = displayNameFromDb(user);
  if (nameKey) {
    const hit = pickUniqueContact(byNameKey.get(nameKey) ?? [], user.hubspot_record_id);
    if (hit) return hit;
    const tokens = nameTokensFromKey(nameKey);
    if (tokens.length >= 2) {
      const last = tokens[tokens.length - 1]!;
      for (let i = 0; i < tokens.length - 1; i++) {
        const slug = slugify(`${tokens[i]} ${last}`);
        const byPair = pickUniqueContact(bySlug.get(slug) ?? [], user.hubspot_record_id);
        if (byPair) return byPair;
      }
    }
  }
  const emailSlug = importedEmailSlug(user.email);
  if (emailSlug) {
    const hit = pickUniqueContact(bySlug.get(emailSlug) ?? [], user.hubspot_record_id);
    if (hit) return hit;
  }
  return null;
}

function pickRealEmail(contact: CsvContact, existingRealAliases: string[]) {
  const preferred = contact.emails.find((e) => e === contact.email) ?? contact.emails[0];
  if (preferred) return preferred;
  return existingRealAliases[0] ?? null;
}

async function loadDbUsers(client: PoolClient) {
  const { rows } = await client.query<DbUser>(
    `select
      id::text as id,
      lower(trim(email)) as email,
      trim(name) as name,
      first_name, last_name,
      phone_number, linkedin_url, city, country, state_region, education,
      hubspot_record_id, company_name, notion_team_member_id, status, role
    from flolabs_users
    where coalesce(status, '') <> 'closed'`,
  );
  return rows;
}

async function loadAliasMap(client: PoolClient) {
  const { rows } = await client.query<{ user_id: string; email: string }>(
    `select user_id::text, lower(trim(email)) as email from user_email_aliases`,
  );
  const byUser = new Map<string, string[]>();
  for (const row of rows) {
    const list = byUser.get(row.user_id) ?? [];
    list.push(row.email);
    byUser.set(row.user_id, list);
  }
  return byUser;
}

async function reassignImportedPrimary(
  client: PoolClient,
  user: DbUser,
  newEmail: string,
  csv: CsvContact,
) {
  const { rows: existing } = await client.query<{ id: string; email: string; name: string }>(
    `select id::text, lower(trim(email)) as email, trim(name) as name
     from flolabs_users where lower(trim(email)) = $1 and id <> $2::uuid limit 1`,
    [newEmail.toLowerCase(), user.id],
  );

  if (existing[0]) {
    const other = existing[0];
    const samePerson =
      normalizeNameKey(other.name) === displayNameFromDb(user) ||
      (csv.hubspotRecordId &&
        (await client.query(
          `select 1 from flolabs_users where id = $1::uuid and hubspot_record_id = $2 limit 1`,
          [other.id, csv.hubspotRecordId],
        )).rowCount === 1);
    if (!samePerson) {
      return { ok: false as const, reason: `email ${newEmail} owned by different user ${other.id} (${other.name})` };
    }
    if (dryRun) {
      return {
        ok: true as const,
        action: "merge" as const,
        targetId: other.id,
        newEmail,
        note: `would merge ${user.id} into ${other.id}`,
      };
    }
    await client.query("begin");
    try {
      await client.query(
        `update time_entries set user_id = $1::uuid, updated_at = now() where user_id = $2::uuid`,
        [other.id, user.id],
      );
      await client.query(
        `update time_entries set flolabs_id = $1::uuid, updated_at = now() where flolabs_id = $2::uuid`,
        [other.id, user.id],
      );
      await client.query(
        `update tags set user_id = $1::uuid
         where user_id = $2::uuid
           and lower(name) not in (select lower(name) from tags where user_id = $1::uuid)`,
        [other.id, user.id],
      );
      await client.query(`delete from tags where user_id = $1::uuid`, [user.id]);
      await client.query(
        `update user_email_aliases set user_id = $1::uuid, updated_at = now() where user_id = $2::uuid`,
        [other.id, user.id],
      );
      await client.query(
        `update flolabs_users set status = 'closed', is_active = false, updated_at = now() where id = $1::uuid`,
        [user.id],
      );
      await client.query("commit");
      return { ok: true as const, action: "merge" as const, targetId: other.id, newEmail };
    } catch (e) {
      await client.query("rollback");
      throw e;
    }
  }

  if (dryRun) {
    return { ok: true as const, action: "reemail" as const, newEmail, note: `would set primary ${user.email} → ${newEmail}` };
  }
  await client.query(
    `update flolabs_users set email = $1, updated_at = now() where id = $2::uuid`,
    [newEmail, user.id],
  );
  await client.query(
    `insert into user_email_aliases (user_id, email, is_primary)
     values ($1::uuid, $2, true)
     on conflict (email) do update set user_id = excluded.user_id, is_primary = true, updated_at = now()`,
    [user.id, newEmail],
  );
  return { ok: true as const, action: "reemail" as const, newEmail };
}

async function backfillUserFromCsv(client: PoolClient, userId: string, csv: CsvContact) {
  const sets: string[] = [];
  const params: unknown[] = [];
  let i = 1;

  const add = (col: string, value: string | null) => {
    if (!value) return;
    sets.push(
      `${col} = coalesce(nullif(trim(${col}), ''), nullif(trim($${i}), ''))`,
    );
    params.push(value);
    i++;
  };

  add("first_name", csv.firstName);
  add("last_name", csv.lastName);
  add("phone_number", csv.phone);
  add("linkedin_url", csv.linkedin);
  add("city", csv.city);
  add("country", csv.country);
  add("state_region", csv.stateRegion);
  add("education", csv.education);
  add("company_name", csv.companyName);
  if (csv.hubspotRecordId) {
    sets.push(`hubspot_record_id = coalesce(flolabs_users.hubspot_record_id, $${i})`);
    params.push(csv.hubspotRecordId);
    i++;
  }
  if (csv.lifecycleStage) {
    sets.push(`hubspot_lifecycle_stage = coalesce(flolabs_users.hubspot_lifecycle_stage, $${i})`);
    params.push(csv.lifecycleStage);
    i++;
  }
  if (csv.leadStatus) {
    sets.push(`hubspot_lead_status = coalesce(flolabs_users.hubspot_lead_status, $${i})`);
    params.push(csv.leadStatus);
    i++;
  }
  if (csv.name) {
    sets.push(
      `name = case when length(trim(coalesce($${i}, ''))) > length(trim(coalesce(name, ''))) then $${i} else name end`,
    );
    params.push(csv.name);
    i++;
  }

  if (sets.length === 0) return 0;
  sets.push("updated_at = now()");
  params.push(userId);

  const sql = `update flolabs_users set ${sets.join(", ")} where id = $${i}::uuid`;
  if (dryRun) return sets.length;
  const res = await client.query(sql, params);
  return res.rowCount ?? 0;
}

function resolveCsvForUser(
  user: DbUser,
  aliasEmails: string[],
  indexes: Awaited<ReturnType<typeof loadCsvIndex>>,
): CsvContact | null {
  const { byRecordId, byEmail, byNameKey } = indexes;
  if (user.hubspot_record_id) {
    const hit = byRecordId.get(user.hubspot_record_id);
    if (hit) return hit;
  }
  if (!isImportedLocal(user.email)) {
    const byPrimary = byEmail.get(user.email);
    if (byPrimary) return byPrimary;
  }
  for (const e of aliasEmails) {
    if (isImportedLocal(e)) continue;
    const hit = byEmail.get(e);
    if (hit) return hit;
  }
  const nameHit = pickUniqueContact(byNameKey.get(displayNameFromDb(user)) ?? [], user.hubspot_record_id);
  if (nameHit) return nameHit;
  return findCsvForImportedUser(user, indexes);
}

async function main() {
  console.log(`${dryRun ? "[dry-run] " : ""}HubSpot CSV: ${csvPath}`);
  const indexes = await loadCsvIndex();
  const pool = createMigrationPool();
  const client = await pool.connect();

  try {
    await client.query(
      `alter table flolabs_users add column if not exists company_name text`,
    );
    await client.query(
      `alter table flolabs_users add column if not exists hubspot_record_id text`,
    );
    await client.query(
      `alter table flolabs_users add column if not exists hubspot_lifecycle_stage text`,
    );
    await client.query(
      `alter table flolabs_users add column if not exists hubspot_lead_status text`,
    );

    const users = await loadDbUsers(client);
    const aliasMap = await loadAliasMap(client);

    const importedUsers = users.filter((u) => isImportedLocal(u.email));
    console.log(`\n@imported.local primary: ${importedUsers.length} user(s)`);

    let reemail = 0;
    let merged = 0;
    let noMatch = 0;
    let skipped = 0;

    for (const user of importedUsers) {
      const aliases = (aliasMap.get(user.id) ?? []).filter((e) => !isImportedLocal(e));
      const csv = findCsvForImportedUser(user, indexes);
      const realFromAlias = aliases[0] ?? null;
      if (!csv && realFromAlias) {
        if (dryRun) {
          reemail++;
          console.log(`  [reemail-alias] ${user.email} → ${realFromAlias} (${user.name})`);
          continue;
        }
        const fakeCsv: CsvContact = {
          email: realFromAlias,
          emails: [realFromAlias],
          name: user.name,
          firstName: user.first_name ?? "",
          lastName: user.last_name ?? "",
          nameKey: displayNameFromDb(user),
          hubspotRecordId: user.hubspot_record_id,
          lifecycleStage: null,
          leadStatus: null,
          companyName: null,
          phone: null,
          linkedin: null,
          country: null,
          city: null,
          stateRegion: null,
          education: null,
        };
        const result = await reassignImportedPrimary(client, user, realFromAlias, fakeCsv);
        if (result.ok) {
          if (result.action === "merge") merged++;
          else reemail++;
          console.log(`  [reemail-alias] ${user.email} → ${realFromAlias}`);
        } else {
          skipped++;
          console.log(`  [skip alias] ${user.email}: ${result.reason}`);
        }
        continue;
      }
      if (!csv) {
        noMatch++;
        console.log(`  [no csv] ${user.email} | ${user.name}`);
        continue;
      }
      const realEmail = pickRealEmail(csv, aliases);
      if (!realEmail) {
        skipped++;
        console.log(`  [no real email in csv] ${user.email} | ${user.name}`);
        continue;
      }
      const result = await reassignImportedPrimary(client, user, realEmail, csv);
      if (!result.ok) {
        skipped++;
        console.log(`  [skip] ${user.email} → ${realEmail}: ${result.reason}`);
        continue;
      }
      if (result.action === "merge") merged++;
      else reemail++;
      console.log(
        `  [${result.action}] ${user.email} → ${realEmail} (${user.name})${"note" in result && result.note ? ` ${result.note}` : ""}`,
      );
    }

    if (!dryRun) {
      const del = await client.query(
        `delete from user_email_aliases where lower(email) like '%@imported.local%' returning email`,
      );
      console.log(`\nRemoved ${del.rowCount ?? 0} @imported.local alias row(s).`);
    } else {
      const { rows: aliasCount } = await client.query<{ n: number }>(
        `select count(*)::int as n from user_email_aliases where lower(email) like '%@imported.local%'`,
      );
      console.log(`\nWould remove ${aliasCount[0]?.n ?? 0} @imported.local alias row(s).`);
    }

    if (closePlaceholders) {
      const placeholderClose = dryRun
        ? await client.query<{ n: number }>(
            `select count(*)::int as n from flolabs_users
             where lower(email) like '%@imported.local%'
               and coalesce(status, '') <> 'closed'
               and (name like 'Imported User%' or email like 'imported-user-%')`,
          )
        : await client.query(
            `update flolabs_users
             set status = 'closed', is_active = false, updated_at = now()
             where lower(email) like '%@imported.local%'
               and coalesce(status, '') <> 'closed'
               and (name like 'Imported User%' or email like 'imported-user-%')
             returning id`,
          );
      const n = dryRun
        ? (placeholderClose as { rows: { n: number }[] }).rows[0]?.n ?? 0
        : (placeholderClose as { rowCount: number | null }).rowCount ?? 0;
      console.log(
        `\n${dryRun ? "Would close" : "Closed"} ${n} Notion placeholder @imported.local account(s).`,
      );
    }

    const closedCleanup = await client.query(
      `update flolabs_users
       set email = 'archived-' || replace(id::text, '-', '') || '@flolabs.invalid',
           updated_at = now()
       where lower(email) like '%@imported.local%'
         and coalesce(status, '') = 'closed'
       returning id`,
    );
    console.log(`\nArchived email on ${closedCleanup.rowCount ?? 0} closed @imported.local row(s).`);

    console.log(`\nFor profile backfill (phone, city, country, …), run:`);
    console.log(`  pnpm exec tsx scripts/merge-legacy-and-hubspot-csv-contacts.ts`);

    console.log(`\nSummary:`);
    console.log(`  imported.local re-email: ${reemail}`);
    console.log(`  imported.local merged into existing: ${merged}`);
    console.log(`  imported.local no CSV match: ${noMatch}`);
    console.log(`  imported.local skipped: ${skipped}`);
    console.log(`\nDone.`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
