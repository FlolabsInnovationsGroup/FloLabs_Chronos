/**
 * Merge flolabs_users rows that share the exact same display name when at least one
 * row uses @imported.local and another row has the same name with a real email.
 * Only merges when a Team Member Notion page is linked on a row or matches any
 * email on the group (primary, aliases, HubSpot raw). @imported.local is never kept
 * as a primary email or alias.
 *
 *   pnpm exec tsx scripts/merge-imported-local-duplicate-names.ts --dry-run
 *   pnpm exec tsx scripts/merge-imported-local-duplicate-names.ts
 *
 * Env: DATABASE_URL (or FL_CHRONOS_*), optional NOTION_API_KEY + NOTION_TEAM_MEMBERS_DB_ID
 */
import type { PoolClient } from "pg";
import { createMigrationPool, loadEnvFiles } from "./db-utils";

loadEnvFiles([".env.local", ".env.production.local"]);

const NOTION_API_BASE = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

const dryRun = process.argv.includes("--dry-run");
const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.split("=")[1]) : 0;

type UserRow = {
  id: string;
  email: string;
  name: string;
  first_name: string | null;
  last_name: string | null;
  phone_number: string | null;
  linkedin_url: string | null;
  city: string | null;
  country: string | null;
  role_applied_for: string | null;
  education: string | null;
  source: string | null;
  notes: string | null;
  notion_team_member_id: string | null;
  notion_team_member_page_url: string | null;
  hubspot_record_id: string | null;
  status: string | null;
  role: string | null;
  updated_at: Date | null;
};

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((v) => String(v ?? "").trim()).filter(Boolean)));
}

function firstNonEmpty(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const trimmed = String(value ?? "").trim();
    if (trimmed) return trimmed;
  }
  return null;
}

function isImportedLocal(email: string) {
  return email.toLowerCase().includes("@imported.local");
}

function normalizeNameKey(name: string) {
  return name.trim().replace(/\s+/g, " ");
}

function displayName(row: UserRow) {
  const fromParts = [row.first_name, row.last_name].map((v) => String(v ?? "").trim()).filter(Boolean).join(" ");
  return normalizeNameKey(String(row.name ?? "").trim() || fromParts);
}

function richnessScore(row: UserRow) {
  let score = 0;
  const bump = (v: string | null | undefined, n = 1) => {
    if (String(v ?? "").trim()) score += n;
  };
  bump(row.notion_team_member_id, 50);
  bump(row.notion_team_member_page_url, 10);
  bump(row.hubspot_record_id, 40);
  bump(row.phone_number, 5);
  bump(row.linkedin_url, 5);
  bump(row.city, 2);
  bump(row.country, 2);
  bump(row.role_applied_for, 2);
  bump(row.education, 2);
  bump(row.source, 2);
  bump(row.notes, 3);
  if (String(row.status ?? "").toLowerCase() === "joined") score += 20;
  if (!isImportedLocal(row.email)) score += 100;
  if (row.updated_at) score += Math.min(10, row.updated_at.getTime() / 1e12);
  return score;
}

function pickCanonical(rows: UserRow[]) {
  return [...rows].sort((a, b) => richnessScore(b) - richnessScore(a))[0]!;
}

function secondaryMergeOrder(rows: UserRow[], canonicalId: string) {
  return rows
    .filter((r) => r.id !== canonicalId)
    .sort((a, b) => {
      const aImp = isImportedLocal(a.email) ? 1 : 0;
      const bImp = isImportedLocal(b.email) ? 1 : 0;
      if (aImp !== bImp) return aImp - bImp;
      return richnessScore(b) - richnessScore(a);
    });
}

function emailsForAliases(rows: UserRow[], extra: string[]) {
  return unique([
    ...rows.map((r) => r.email),
    ...extra,
  ]).filter((e) => !isImportedLocal(e));
}

async function loadAliasEmails(client: PoolClient, userIds: string[]) {
  if (userIds.length === 0) return [] as string[];
  const { rows } = await client.query<{ email: string }>(
    `select lower(trim(email)) as email from user_email_aliases where user_id = any($1::uuid[])`,
    [userIds],
  );
  return rows.map((r) => r.email);
}

function emailsFromHubspotRaw(raw: unknown): string[] {
  if (!raw || typeof raw !== "object") return [];
  const data = raw as Record<string, unknown>;
  const out: string[] = [];
  const primary = data.Email ?? data.email;
  if (typeof primary === "string" && primary.trim()) out.push(primary.trim().toLowerCase());
  const extra = data.emails ?? data["Additional email addresses"];
  if (Array.isArray(extra)) {
    for (const item of extra) {
      const v = String(item ?? "").trim().toLowerCase();
      if (v) out.push(v);
    }
  } else if (typeof extra === "string") {
    for (const part of extra.split(/[,;]/)) {
      const v = part.trim().toLowerCase();
      if (v) out.push(v);
    }
  }
  return out;
}

async function loadHubspotEmails(client: PoolClient, userIds: string[]) {
  if (userIds.length === 0) return [] as string[];
  const { rows } = await client.query<{ hubspot_raw_data: unknown }>(
    `select hubspot_raw_data from flolabs_users where id = any($1::uuid[])`,
    [userIds],
  );
  return unique(rows.flatMap((r) => emailsFromHubspotRaw(r.hubspot_raw_data)));
}

function rowHasNotionLink(row: UserRow) {
  return Boolean(
    String(row.notion_team_member_id ?? "").trim() || String(row.notion_team_member_page_url ?? "").trim(),
  );
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

type NotionEmailIndex = Map<string, { pageId: string; name: string }>;

async function buildNotionEmailIndex(): Promise<NotionEmailIndex | null> {
  const notionApiKey = process.env.NOTION_API_KEY?.trim();
  const dbId = process.env.NOTION_TEAM_MEMBERS_DB_ID?.trim();
  if (!notionApiKey || !dbId) return null;

  const index: NotionEmailIndex = new Map();
  let cursor: string | undefined;

  do {
    const body: Record<string, unknown> = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;

    const res = await fetch(`${NOTION_API_BASE}/databases/${dbId}/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${notionApiKey}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.warn(`Notion directory query failed HTTP ${res.status}; DB-only notion links will still apply.`);
      break;
    }

    const data = (await res.json()) as {
      results: Array<{
        id: string;
        properties?: Record<string, { type?: string; email?: string | null }>;
      }>;
      has_more: boolean;
      next_cursor: string | null;
    };

    for (const page of data.results) {
      const titleProp = page.properties?.Name ?? page.properties?.["Full Name"];
      const name =
        titleProp?.type === "title"
          ? (titleProp as { title?: Array<{ plain_text?: string }> }).title?.[0]?.plain_text?.trim() ?? ""
          : "";
      const email =
        page.properties?.Email?.type === "email" ? page.properties.Email.email?.trim() ?? "" : "";
      const personal =
        page.properties?.["Personal Email"]?.type === "email"
          ? page.properties["Personal Email"].email?.trim() ?? ""
          : "";
      for (const addr of [email, personal]) {
        if (!addr) continue;
        index.set(normalizeEmail(addr), { pageId: page.id, name: name || addr });
      }
    }

    cursor = data.has_more && data.next_cursor ? data.next_cursor : undefined;
  } while (cursor);

  return index;
}

async function collectGroupEmails(client: PoolClient, rows: UserRow[]) {
  const ids = rows.map((r) => r.id);
  const aliasEmails = await loadAliasEmails(client, ids);
  const hubspotEmails = await loadHubspotEmails(client, ids);
  return unique([...rows.map((r) => r.email), ...aliasEmails, ...hubspotEmails]).filter(
    (e) => !isImportedLocal(e),
  );
}

function notionPageUrlFromId(pageId: string) {
  return `https://www.notion.so/${pageId.replace(/-/g, "")}`;
}

function groupHasNotionAssociation(
  rows: UserRow[],
  groupEmails: string[],
  notionIndex: NotionEmailIndex | null,
): { ok: boolean; reason: string; notionId?: string; notionPageUrl?: string } {
  const linked = rows.find(rowHasNotionLink);
  if (linked) {
    return {
      ok: true,
      reason: "flolabs_users notion_team_member_*",
      notionId: linked.notion_team_member_id ?? undefined,
      notionPageUrl: linked.notion_team_member_page_url ?? undefined,
    };
  }
  if (notionIndex) {
    for (const email of groupEmails) {
      const hit = notionIndex.get(normalizeEmail(email));
      if (hit) {
        return {
          ok: true,
          reason: `Notion Team Member email ${email}`,
          notionId: hit.pageId,
          notionPageUrl: notionPageUrlFromId(hit.pageId),
        };
      }
    }
  }
  return { ok: false, reason: "no Notion Team Member link for any email in group" };
}

function groupQualifies(rows: UserRow[]) {
  const hasImported = rows.some((r) => isImportedLocal(r.email));
  const hasReal = rows.some((r) => !isImportedLocal(r.email));
  return hasImported && hasReal;
}

async function mergeGroup(
  client: PoolClient,
  nameKey: string,
  rows: UserRow[],
  notionFromIndex?: { notionId?: string; notionPageUrl?: string },
) {
  const canonical = pickCanonical(rows);
  const secondaries = secondaryMergeOrder(rows, canonical.id);
  const allIds = rows.map((r) => r.id);
  const secondaryIds = secondaries.map((s) => s.id);

  const aliasEmails = await loadAliasEmails(client, allIds);
  const selectedEmails = emailsForAliases(rows, aliasEmails);
  const primaryEmail =
    selectedEmails.find((e) => e.toLowerCase() === canonical.email.toLowerCase()) ??
    selectedEmails[0] ??
    canonical.email;

  const selectedPhoneNumbers = unique(rows.map((r) => r.phone_number));
  const selectedLinkedinUrls = unique(rows.map((r) => r.linkedin_url));
  const selectedCities = unique(rows.map((r) => r.city));
  const selectedCountries = unique(rows.map((r) => r.country));
  const selectedRoles = unique(rows.map((r) => r.role_applied_for));
  const selectedEducation = unique(rows.map((r) => r.education));
  const selectedSources = unique(rows.map((r) => r.source));
  const selectedFirstNames = unique(rows.map((r) => r.first_name));
  const selectedLastNames = unique(rows.map((r) => r.last_name));

  const mergedNotionTeamMemberId = firstNonEmpty(
    canonical.notion_team_member_id,
    notionFromIndex?.notionId,
    ...rows.map((r) => r.notion_team_member_id),
  );
  const mergedNotionTeamMemberPageUrl = firstNonEmpty(
    canonical.notion_team_member_page_url,
    notionFromIndex?.notionPageUrl,
    ...rows.map((r) => r.notion_team_member_page_url),
  );

  const mergedSummary = {
    mergedLeadIds: allIds,
    nameKey,
    secondaryOrder: secondaries.map((s) => ({ id: s.id, email: s.email })),
    keptEmails: selectedEmails,
    mergedAt: new Date().toISOString(),
    mergedBy: "scripts/merge-imported-local-duplicate-names.ts",
  };
  const mergedNotes = [String(canonical.notes ?? "").trim(), `MERGE_RECORD ${JSON.stringify(mergedSummary)}`]
    .filter(Boolean)
    .join("\n\n");
  const mergedName = nameKey || primaryEmail;

  console.log(
    `  canonical ${canonical.id} <${canonical.email}>  ←  ${secondaryIds.length} secondary(s): ${secondaries.map((s) => s.email).join(", ")}`,
  );

  if (dryRun) return;

  await client.query(
    `update flolabs_users set
      email = $2,
      name = $3,
      first_name = $4,
      last_name = $5,
      phone_number = $6,
      linkedin_url = $7,
      city = $8,
      country = $9,
      role_applied_for = $10,
      education = $11,
      source = $12,
      notes = $13,
      notion_team_member_id = coalesce($14, notion_team_member_id),
      notion_team_member_page_url = coalesce($15, notion_team_member_page_url),
      updated_at = now()
    where id = $1::uuid`,
    [
      canonical.id,
      primaryEmail,
      mergedName,
      selectedFirstNames.join(" / ") || canonical.first_name,
      selectedLastNames.join(" / ") || canonical.last_name,
      selectedPhoneNumbers.join(", ") || canonical.phone_number,
      selectedLinkedinUrls.join(", ") || canonical.linkedin_url,
      selectedCities.join(", ") || canonical.city,
      selectedCountries.join(", ") || canonical.country,
      selectedRoles.join(" | ") || canonical.role_applied_for,
      selectedEducation.join(" | ") || canonical.education,
      selectedSources.join(" | ") || canonical.source,
      mergedNotes,
      mergedNotionTeamMemberId,
      mergedNotionTeamMemberPageUrl,
    ],
  );

  const secondaryEmails = rows
    .filter((r) => secondaryIds.includes(r.id))
    .map((r) => r.email.toLowerCase())
    .filter(Boolean);

  if (secondaryIds.length > 0) {
    await client.query(
      `update flolabs_users
       set status = 'closed', is_active = false, updated_at = now()
       where (id = any($1::uuid[]) or lower(email) = any($2::text[]))
         and lower(coalesce(role, '')) not in ('admin', 'hr')`,
      [secondaryIds, secondaryEmails],
    );
  }

  const canonicalUserRow = await client.query<{ id: string }>(
    `select id from flolabs_users where id = $1::uuid or lower(email) = lower($2) limit 1`,
    [canonical.id, primaryEmail],
  );
  const chronosCanonicalUserId = canonicalUserRow.rows[0]?.id ?? canonical.id;

  const secondaryUserRows = await client.query<{ id: string }>(
    `select id from flolabs_users
     where id = any($1::uuid[]) or lower(email) = any($2::text[])`,
    [secondaryIds, secondaryEmails],
  );
  const secondaryUserIds = [
    ...new Set([
      ...secondaryIds,
      ...secondaryUserRows.rows.map((r) => String(r.id)),
    ]),
  ].filter((id) => id !== chronosCanonicalUserId);

  if (secondaryUserIds.length > 0) {
    await client.query(
      `update time_entries set user_id = $1::uuid, updated_at = now() where user_id = any($2::uuid[])`,
      [chronosCanonicalUserId, secondaryUserIds],
    );
    await client.query(
      `update time_entries set flolabs_id = $1::uuid, updated_at = now() where flolabs_id = any($2::uuid[])`,
      [chronosCanonicalUserId, secondaryUserIds],
    );
    await client.query(
      `update time_entries set applicant_id = $1::uuid, updated_at = now() where applicant_id = any($2::uuid[])`,
      [chronosCanonicalUserId, secondaryUserIds],
    );
    await client.query(
      `update tags set user_id = $1::uuid
       where user_id = any($2::uuid[])
         and lower(name) not in (select lower(name) from tags where user_id = $1::uuid)`,
      [chronosCanonicalUserId, secondaryUserIds],
    );
    await client.query(`delete from tags where user_id = any($1::uuid[])`, [secondaryUserIds]);
    await client.query(
      `update user_email_aliases set user_id = $1::uuid, updated_at = now()
       where user_id = any($2::uuid[])`,
      [chronosCanonicalUserId, secondaryUserIds],
    );
  }

  for (const secondaryId of secondaryIds) {
    await client.query(
      `insert into applicant_duplicate_reviews (
         primary_applicant_id, duplicate_applicant_id, status, confidence_score, reasons, notes, reviewed_at, updated_at
       ) values ($1, $2, 'merged', 999, '["imported.local name merge"]'::jsonb, $3, now(), now())
       on conflict (primary_applicant_id, duplicate_applicant_id)
       do update set status = 'merged', notes = excluded.notes, reviewed_at = now(), updated_at = now()`,
      [canonical.id, secondaryId, `Merged into ${canonical.id} by merge-imported-local-duplicate-names.`],
    );
  }

  for (const email of selectedEmails) {
    await client.query(
      `insert into user_email_aliases (user_id, email, is_primary)
       values ($1::uuid, $2, $3)
       on conflict (email) do update set user_id = excluded.user_id, is_primary = excluded.is_primary, updated_at = now()`,
      [chronosCanonicalUserId, email.toLowerCase(), email.toLowerCase() === primaryEmail.toLowerCase()],
    );
  }

  await client.query(
    `delete from user_email_aliases
     where user_id = $1::uuid and lower(email) like '%@imported.local%'`,
    [chronosCanonicalUserId],
  );
}

async function main() {
  const pool = createMigrationPool();
  const client = await pool.connect();
  try {
    console.log("Building Notion Team Members email index (optional)…");
    const notionIndex = await buildNotionEmailIndex();
    if (notionIndex) {
      console.log(`Notion index: ${notionIndex.size} email(s) on Team Member pages.`);
    } else {
      console.log("Notion index skipped (missing NOTION_API_KEY or NOTION_TEAM_MEMBERS_DB_ID).");
    }

    const { rows } = await client.query<UserRow>(
      `select
        id::text as id,
        lower(trim(email)) as email,
        trim(name) as name,
        first_name, last_name, phone_number, linkedin_url, city, country,
        role_applied_for, education, source, notes,
        notion_team_member_id, notion_team_member_page_url, hubspot_record_id,
        status, role, updated_at
      from flolabs_users
      where coalesce(status, '') <> 'closed'
        and lower(coalesce(role, '')) not in ('admin', 'hr')
        and trim(coalesce(name, '')) <> ''`,
    );

    const byName = new Map<string, UserRow[]>();
    for (const row of rows) {
      const key = displayName(row);
      if (!key) continue;
      const list = byName.get(key) ?? [];
      list.push(row);
      byName.set(key, list);
    }

    const groups: Array<{
      nameKey: string;
      rows: UserRow[];
      notionReason: string;
      notionId?: string;
      notionPageUrl?: string;
    }> = [];
    let skippedNoRealDuplicate = 0;
    let skippedNoNotion = 0;

    for (const [nameKey, groupRows] of byName) {
      if (groupRows.length < 2) continue;
      if (!groupQualifies(groupRows)) {
        if (groupRows.some((r) => isImportedLocal(r.email))) skippedNoRealDuplicate++;
        continue;
      }
      const groupEmails = await collectGroupEmails(client, groupRows);
      const notion = groupHasNotionAssociation(groupRows, groupEmails, notionIndex);
      if (!notion.ok) {
        skippedNoNotion++;
        continue;
      }
      groups.push({
        nameKey,
        rows: groupRows,
        notionReason: notion.reason,
        notionId: notion.notionId,
        notionPageUrl: notion.notionPageUrl,
      });
    }

    groups.sort((a, b) => {
      const aReal = a.rows.some((r) => !isImportedLocal(r.email)) ? 0 : 1;
      const bReal = b.rows.some((r) => !isImportedLocal(r.email)) ? 0 : 1;
      if (aReal !== bReal) return aReal - bReal;
      return a.nameKey.localeCompare(b.nameKey);
    });

    const toProcess = limit > 0 ? groups.slice(0, limit) : groups;
    console.log(
      `${dryRun ? "[dry-run] " : ""}Found ${groups.length} mergeable name group(s) (${rows.length} users scanned).`,
    );
    console.log(
      `Skipped ${skippedNoRealDuplicate} group(s) with only @imported.local; ${skippedNoNotion} group(s) without Notion Team Member link.`,
    );
    console.log(`Processing ${toProcess.length} group(s).`);

    let mergedGroups = 0;
    for (const { nameKey, rows: groupRows, notionReason, notionId, notionPageUrl } of toProcess) {
      console.log(
        `\n[${mergedGroups + 1}/${toProcess.length}] "${nameKey}" (${groupRows.length} profiles, notion: ${notionReason})`,
      );
      if (dryRun) {
        const canonical = pickCanonical(groupRows);
        const order = secondaryMergeOrder(groupRows, canonical.id);
        const emails = await collectGroupEmails(client, groupRows);
        console.log(`  would canonicalize ${canonical.email}`);
        console.log(`  merge order: ${order.map((s) => s.email).join(" → ")}`);
        console.log(`  alias emails kept: ${emailsForAliases(groupRows, emails).join(", ") || "(none)"}`);
        mergedGroups++;
        continue;
      }
      await client.query("begin");
      try {
        await mergeGroup(client, nameKey, groupRows, { notionId, notionPageUrl });
        await client.query("commit");
        mergedGroups++;
      } catch (err) {
        await client.query("rollback");
        console.error(`  FAILED for "${nameKey}":`, err);
        throw err;
      }
    }

    if (!dryRun) {
      const del = await client.query(
        `delete from user_email_aliases where lower(email) like '%@imported.local%' returning email`,
      );
      console.log(`\nRemoved ${del.rowCount ?? 0} leftover @imported.local alias row(s).`);
    }

    console.log(`\nDone. ${mergedGroups} group(s) ${dryRun ? "would be " : ""}merged.`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
