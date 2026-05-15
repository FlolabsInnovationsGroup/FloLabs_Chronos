/**
 * AWS RDS migration: consolidate identity into physical table `public.flolabs_users`
 * (Chronos Drizzle `users` + Hephaestus former `website_applicants` / legacy `public.users`).
 *
 * Usage:
 *   pnpm exec tsx scripts/migrate-to-flolabs-users.ts --dry-run   # log only
 *   pnpm exec tsx scripts/migrate-to-flolabs-users.ts             # execute
 *
 * Env: DATABASE_URL or FL_CHRONOS_DATABASE_URL (see scripts/db-utils.ts).
 */
import { createMigrationPool, createSqlHelpers, loadEnvFiles } from "./db-utils";

loadEnvFiles([".env.local", ".env.production.local"]);

const dryRun = process.argv.includes("--dry-run");

async function tableExists(sql: ReturnType<typeof createSqlHelpers>, name: string) {
  const rows = await sql.query<{ exists: boolean }>(
    `select exists(
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = $1
    ) as exists`,
    [name],
  );
  return Boolean(rows[0]?.exists);
}

async function run(sql: ReturnType<typeof createSqlHelpers>, label: string, text: string, params: unknown[] = []) {
  console.log(`\n→ ${label}`);
  if (dryRun) {
    console.log("[dry-run] skip:", text.replace(/\s+/g, " ").slice(0, 200) + (text.length > 200 ? "…" : ""));
    return;
  }
  await sql.exec(text, params);
  console.log("  done.");
}

/** Columns expected by Chronos `flolabs_users` / Hephaestus (idempotent adds). */
const FLOLABS_USER_COLUMNS_SQL = `
  alter table flolabs_users add column if not exists hr_binary_role boolean default false;
  alter table flolabs_users add column if not exists first_name text;
  alter table flolabs_users add column if not exists last_name text;
  alter table flolabs_users add column if not exists phone_number text;
  alter table flolabs_users add column if not exists country text;
  alter table flolabs_users add column if not exists state_region text;
  alter table flolabs_users add column if not exists city text;
  alter table flolabs_users add column if not exists latitude double precision;
  alter table flolabs_users add column if not exists longitude double precision;
  alter table flolabs_users add column if not exists linkedin_url text;
  alter table flolabs_users add column if not exists education text;
  alter table flolabs_users add column if not exists source text;
  alter table flolabs_users add column if not exists referral_name text;
  alter table flolabs_users add column if not exists cv_file_name text;
  alter table flolabs_users add column if not exists cv_url text;
  alter table flolabs_users add column if not exists role_applied_for text;
  alter table flolabs_users add column if not exists stage text not null default 'application_submitted';
  alter table flolabs_users add column if not exists status text not null default 'joined';
  alter table flolabs_users add column if not exists joined_at timestamptz default now();
  alter table flolabs_users add column if not exists last_visited_at timestamptz;
  alter table flolabs_users add column if not exists notes text;
  alter table flolabs_users add column if not exists safe_senders_confirmed boolean default false;
  alter table flolabs_users add column if not exists communication_consent boolean default false;
  alter table flolabs_users add column if not exists low_effort_rollback_after timestamptz;
  alter table flolabs_users add column if not exists low_effort_return_stage text;
  alter table flolabs_users add column if not exists notion_team_member_page_url text;
  alter table flolabs_users add column if not exists external_applicant_id text;
  alter table flolabs_users add column if not exists date_of_birth text;
  alter table flolabs_users add column if not exists gender text;
  alter table flolabs_users add column if not exists field_of_study text;
  alter table flolabs_users add column if not exists current_job_title text;
  alter table flolabs_users add column if not exists company_name text;
  alter table flolabs_users add column if not exists last_website_visit timestamptz;
  alter table flolabs_users add column if not exists hubspot_record_id text;
  alter table flolabs_users add column if not exists hubspot_status text;
  alter table flolabs_users add column if not exists hubspot_owner text;
  alter table flolabs_users add column if not exists hubspot_lifecycle_stage text;
  alter table flolabs_users add column if not exists hubspot_lead_status text;
  alter table flolabs_users add column if not exists hubspot_last_modified_at timestamptz;
  alter table flolabs_users add column if not exists hubspot_raw_data jsonb;
  alter table flolabs_users add column if not exists synced_to_team_members boolean not null default false;
  alter table flolabs_users add column if not exists last_login_at timestamptz;
`.trim();

async function ensureFlolabsIndexes(sql: ReturnType<typeof createSqlHelpers>) {
  await run(sql, "index idx_flolabs_users_stage", `create index if not exists idx_flolabs_users_stage on flolabs_users(stage)`);
  await run(sql, "index idx_flolabs_users_status", `create index if not exists idx_flolabs_users_status on flolabs_users(status)`);
}
const APPLICANT_FK_DROPS = [
  `alter table discussion_replies drop constraint if exists discussion_replies_author_flolabs_id_applicants_id_fk`,
  `alter table discussion_replies drop constraint if exists discussion_replies_author_applicant_id_applicants_id_fk`,
  `alter table entry_discussions drop constraint if exists entry_discussions_started_by_flolabs_id_applicants_id_fk`,
  `alter table entry_discussions drop constraint if exists entry_discussions_started_by_applicant_id_applicants_id_fk`,
  `alter table entry_discussions drop constraint if exists entry_discussions_resolved_by_flolabs_id_applicants_id_fk`,
  `alter table entry_discussions drop constraint if exists entry_discussions_resolved_by_applicant_id_applicants_id_fk`,
  `alter table tags drop constraint if exists tags_flolabs_id_applicants_id_fk`,
  `alter table tags drop constraint if exists tags_applicant_id_applicants_id_fk`,
  `alter table time_entries drop constraint if exists time_entries_flolabs_id_applicants_id_fk`,
  `alter table time_entries drop constraint if exists time_entries_applicant_id_applicants_id_fk`,
  `alter table applicant_duplicate_reviews drop constraint if exists applicant_duplicate_reviews_primary_applicant_id_applicants_id_fk`,
  `alter table applicant_duplicate_reviews drop constraint if exists applicant_duplicate_reviews_duplicate_applicant_id_applicants_id_fk`,
  `alter table applicant_duplicate_reviews drop constraint if exists applicant_duplicate_reviews_canonical_applicant_id_applicants_id_fk`,
];

const APPLICANT_FK_DROPS_FLOLABS = [
  `alter table discussion_replies drop constraint if exists discussion_replies_author_flolabs_id_flolabs_users_id_fk`,
  `alter table discussion_replies drop constraint if exists discussion_replies_author_applicant_id_flolabs_users_id_fk`,
  `alter table entry_discussions drop constraint if exists entry_discussions_started_by_flolabs_id_flolabs_users_id_fk`,
  `alter table entry_discussions drop constraint if exists entry_discussions_started_by_applicant_id_flolabs_users_id_fk`,
  `alter table entry_discussions drop constraint if exists entry_discussions_resolved_by_flolabs_id_flolabs_users_id_fk`,
  `alter table entry_discussions drop constraint if exists entry_discussions_resolved_by_applicant_id_flolabs_users_id_fk`,
  `alter table tags drop constraint if exists tags_flolabs_id_flolabs_users_id_fk`,
  `alter table tags drop constraint if exists tags_applicant_id_flolabs_users_id_fk`,
  `alter table time_entries drop constraint if exists time_entries_flolabs_id_flolabs_users_id_fk`,
  `alter table time_entries drop constraint if exists time_entries_applicant_id_flolabs_users_id_fk`,
  `alter table applicant_duplicate_reviews drop constraint if exists applicant_duplicate_reviews_primary_applicant_id_flolabs_users_id_fk`,
  `alter table applicant_duplicate_reviews drop constraint if exists applicant_duplicate_reviews_duplicate_applicant_id_flolabs_users_id_fk`,
  `alter table applicant_duplicate_reviews drop constraint if exists applicant_duplicate_reviews_canonical_applicant_id_flolabs_users_id_fk`,
];

const APPLICANT_FK_ADDS = [
  `alter table discussion_replies add constraint discussion_replies_author_flolabs_id_flolabs_users_id_fk foreign key (author_flolabs_id) references flolabs_users(id) on delete set null`,
  `alter table discussion_replies add constraint discussion_replies_author_applicant_id_flolabs_users_id_fk foreign key (author_applicant_id) references flolabs_users(id) on delete set null`,
  `alter table entry_discussions add constraint entry_discussions_started_by_flolabs_id_flolabs_users_id_fk foreign key (started_by_flolabs_id) references flolabs_users(id) on delete set null`,
  `alter table entry_discussions add constraint entry_discussions_started_by_applicant_id_flolabs_users_id_fk foreign key (started_by_applicant_id) references flolabs_users(id) on delete set null`,
  `alter table entry_discussions add constraint entry_discussions_resolved_by_flolabs_id_flolabs_users_id_fk foreign key (resolved_by_flolabs_id) references flolabs_users(id) on delete set null`,
  `alter table entry_discussions add constraint entry_discussions_resolved_by_applicant_id_flolabs_users_id_fk foreign key (resolved_by_applicant_id) references flolabs_users(id) on delete set null`,
  `alter table tags add constraint tags_flolabs_id_flolabs_users_id_fk foreign key (flolabs_id) references flolabs_users(id) on delete set null`,
  `alter table tags add constraint tags_applicant_id_flolabs_users_id_fk foreign key (applicant_id) references flolabs_users(id) on delete set null`,
  `alter table time_entries add constraint time_entries_flolabs_id_flolabs_users_id_fk foreign key (flolabs_id) references flolabs_users(id) on delete set null`,
  `alter table time_entries add constraint time_entries_applicant_id_flolabs_users_id_fk foreign key (applicant_id) references flolabs_users(id) on delete set null`,
  `alter table applicant_duplicate_reviews add constraint applicant_duplicate_reviews_primary_applicant_id_flolabs_users_id_fk foreign key (primary_applicant_id) references flolabs_users(id) on delete cascade`,
  `alter table applicant_duplicate_reviews add constraint applicant_duplicate_reviews_duplicate_applicant_id_flolabs_users_id_fk foreign key (duplicate_applicant_id) references flolabs_users(id) on delete cascade`,
  `alter table applicant_duplicate_reviews add constraint applicant_duplicate_reviews_canonical_applicant_id_flolabs_users_id_fk foreign key (canonical_applicant_id) references flolabs_users(id) on delete set null`,
];

function quotePgIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

async function dropForeignKeysReferencingTable(sql: ReturnType<typeof createSqlHelpers>, referencedTable: string) {
  const rows = await sql.query<{ conname: string; relname: string }>(
    `
    select c.conname, t.relname as relname
    from pg_constraint c
    join pg_class ref on ref.oid = c.confrelid
    join pg_namespace refn on refn.oid = ref.relnamespace
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where c.contype = 'f'
      and refn.nspname = 'public'
      and ref.relname = $1
      and n.nspname = 'public'
    `,
    [referencedTable],
  );
  for (const { conname, relname } of rows) {
    await run(
      sql,
      `drop FK on ${relname} → ${referencedTable} (${conname})`,
      `alter table ${quotePgIdent(relname)} drop constraint if exists ${quotePgIdent(conname)}`,
    );
  }
}

async function dropApplicantForeignKeys(sql: ReturnType<typeof createSqlHelpers>) {
  for (const d of APPLICANT_FK_DROPS) {
    await run(sql, `drop FK: ${d.slice(0, 60)}…`, d);
  }
  for (const d of APPLICANT_FK_DROPS_FLOLABS) {
    await run(sql, `drop FK (re-run): ${d.slice(0, 55)}…`, d);
  }
}

async function addApplicantForeignKeys(sql: ReturnType<typeof createSqlHelpers>) {
  for (const a of APPLICANT_FK_ADDS) {
    await run(sql, `add FK: ${a.slice(0, 70)}…`, a);
  }
}

/** After FK drops: map applicant-scoped UUIDs to Chronos ids, remap legacy Hephaestus rows, null/delete orphans. */
async function alignAndCleanUserRefs(sql: ReturnType<typeof createSqlHelpers>, hasApplicants: boolean) {
  if (hasApplicants) {
    await run(
      sql,
      "time_entries.applicant_id → chronos user id where linked",
      `update time_entries te
       set applicant_id = a.chronos_user_id
       from applicants a
       where te.applicant_id = a.id and a.chronos_user_id is not null and te.applicant_id is distinct from a.chronos_user_id`,
    );
    await run(
      sql,
      "time_entries.flolabs_id → chronos user id where linked",
      `update time_entries te
       set flolabs_id = a.chronos_user_id
       from applicants a
       where te.flolabs_id = a.id and a.chronos_user_id is not null and te.flolabs_id is distinct from a.chronos_user_id`,
    );
    await run(
      sql,
      "tags.applicant_id → chronos user id where linked",
      `update tags t
       set applicant_id = a.chronos_user_id
       from applicants a
       where t.applicant_id = a.id and a.chronos_user_id is not null and t.applicant_id is distinct from a.chronos_user_id`,
    );
    await run(
      sql,
      "tags.flolabs_id → chronos user id where linked",
      `update tags t
       set flolabs_id = a.chronos_user_id
       from applicants a
       where t.flolabs_id = a.id and a.chronos_user_id is not null and t.flolabs_id is distinct from a.chronos_user_id`,
    );
  }

  const hasLegacy = await tableExists(sql, "website_applicants_legacy");
  const hasConv = await tableExists(sql, "website_applicant_conversations");
  if (hasConv) {
    if (hasLegacy) {
      await run(
        sql,
        "website_applicant_conversations: remap legacy applicant_id via email match",
        `update website_applicant_conversations c
         set applicant_id = m.fu_id
         from (
           select distinct on (l.id) l.id as legacy_id, fu.id as fu_id
           from website_applicants_legacy l
           inner join flolabs_users fu on lower(trim(coalesce(fu.email, ''))) = lower(trim(coalesce(l.email, '')))
           where coalesce(trim(l.email), '') <> '' and coalesce(trim(fu.email), '') <> ''
           order by l.id, fu.id
         ) m
         where c.applicant_id = m.legacy_id`,
      );
    }
    await run(
      sql,
      "delete website_applicant_conversations rows with no flolabs_users match",
      `delete from website_applicant_conversations c
       where not exists (select 1 from flolabs_users u where u.id = c.applicant_id)`,
    );
  }

  await run(
    sql,
    "null orphan tags.flolabs_id",
    `update tags t set flolabs_id = null where t.flolabs_id is not null and not exists (select 1 from flolabs_users u where u.id = t.flolabs_id)`,
  );
  await run(
    sql,
    "null orphan tags.applicant_id",
    `update tags t set applicant_id = null where t.applicant_id is not null and not exists (select 1 from flolabs_users u where u.id = t.applicant_id)`,
  );
  await run(
    sql,
    "null orphan time_entries.flolabs_id",
    `update time_entries te set flolabs_id = null where te.flolabs_id is not null and not exists (select 1 from flolabs_users u where u.id = te.flolabs_id)`,
  );
  await run(
    sql,
    "null orphan time_entries.applicant_id",
    `update time_entries te set applicant_id = null where te.applicant_id is not null and not exists (select 1 from flolabs_users u where u.id = te.applicant_id)`,
  );
  await run(
    sql,
    "null orphan discussion_replies.author_flolabs_id",
    `update discussion_replies dr set author_flolabs_id = null where dr.author_flolabs_id is not null and not exists (select 1 from flolabs_users u where u.id = dr.author_flolabs_id)`,
  );
  await run(
    sql,
    "null orphan discussion_replies.author_applicant_id",
    `update discussion_replies dr set author_applicant_id = null where dr.author_applicant_id is not null and not exists (select 1 from flolabs_users u where u.id = dr.author_applicant_id)`,
  );
  await run(
    sql,
    "null orphan entry_discussions started_by_flolabs_id",
    `update entry_discussions ed set started_by_flolabs_id = null where ed.started_by_flolabs_id is not null and not exists (select 1 from flolabs_users u where u.id = ed.started_by_flolabs_id)`,
  );
  await run(
    sql,
    "null orphan entry_discussions.started_by_applicant_id",
    `update entry_discussions ed set started_by_applicant_id = null where ed.started_by_applicant_id is not null and not exists (select 1 from flolabs_users u where u.id = ed.started_by_applicant_id)`,
  );
  await run(
    sql,
    "null orphan entry_discussions.resolved_by_flolabs_id",
    `update entry_discussions ed set resolved_by_flolabs_id = null where ed.resolved_by_flolabs_id is not null and not exists (select 1 from flolabs_users u where u.id = ed.resolved_by_flolabs_id)`,
  );
  await run(
    sql,
    "null orphan entry_discussions.resolved_by_applicant_id",
    `update entry_discussions ed set resolved_by_applicant_id = null where ed.resolved_by_applicant_id is not null and not exists (select 1 from flolabs_users u where u.id = ed.resolved_by_applicant_id)`,
  );

  const hasDupReviews = await tableExists(sql, "applicant_duplicate_reviews");
  if (hasDupReviews) {
    await run(
      sql,
      "applicant_duplicate_reviews: clear orphan canonical_applicant_id",
      `update applicant_duplicate_reviews adr
       set canonical_applicant_id = null
       where adr.canonical_applicant_id is not null
         and not exists (select 1 from flolabs_users u where u.id = adr.canonical_applicant_id)`,
    );
    await run(
      sql,
      "applicant_duplicate_reviews: delete rows missing primary/duplicate in flolabs_users",
      `delete from applicant_duplicate_reviews adr
       where not exists (select 1 from flolabs_users u where u.id = adr.primary_applicant_id)
          or not exists (select 1 from flolabs_users u where u.id = adr.duplicate_applicant_id)`,
    );
  }
}

/** Drop all FKs on website_applicant_conversations so applicant_id can move off legacy ids. */
async function dropWebsiteApplicantConversationForeignKeys(sql: ReturnType<typeof createSqlHelpers>) {
  if (!(await tableExists(sql, "website_applicant_conversations"))) return;
  const rows = await sql.query<{ conname: string }>(
    `
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'website_applicant_conversations'
      and c.contype = 'f'
    `,
  );
  for (const { conname } of rows) {
    await run(
      sql,
      `drop conversation FK ${conname}`,
      `alter table website_applicant_conversations drop constraint if exists ${quotePgIdent(conname)}`,
    );
  }
}

/** Repoint Hephaestus conversation FK to flolabs_users (run after data cleanup). */
async function addWebsiteApplicantConversationForeignKey(sql: ReturnType<typeof createSqlHelpers>) {
  const hasConv = await tableExists(sql, "website_applicant_conversations");
  if (!hasConv) return;
  await run(
    sql,
    "drop website_applicant_conversations FK to flolabs_users if re-run",
    `alter table website_applicant_conversations drop constraint if exists website_applicant_conversations_applicant_id_flolabs_users_id_fk`,
  );
  await run(
    sql,
    "website_applicant_conversations → flolabs_users FK",
    `alter table website_applicant_conversations
     add constraint website_applicant_conversations_applicant_id_flolabs_users_id_fk
     foreign key (applicant_id) references flolabs_users(id) on delete cascade`,
  );
}

async function main() {
  const pool = createMigrationPool();
  const sql = createSqlHelpers(pool);
  try {
    console.log(dryRun ? "migrate-to-flolabs-users (DRY RUN)" : "migrate-to-flolabs-users (LIVE)");

    const hasFlolabs = await tableExists(sql, "flolabs_users");
    const hasUsers = await tableExists(sql, "users");
    const hasWebsiteApplicants = await tableExists(sql, "website_applicants");
    const hasApplicants = await tableExists(sql, "applicants");

    console.log("Detected:", { hasFlolabs, hasUsers, hasWebsiteApplicants, hasApplicants });

    // 1) Ensure physical table name is flolabs_users
    if (!hasFlolabs && hasUsers) {
      await run(sql, "rename public.users → public.flolabs_users", `alter table users rename to flolabs_users`);
    } else if (!hasFlolabs && hasWebsiteApplicants && !hasUsers) {
      await run(
        sql,
        "rename public.website_applicants → public.flolabs_users",
        `alter table website_applicants rename to flolabs_users`,
      );
    } else if (!hasFlolabs) {
      throw new Error(
        "No flolabs_users, users, or website_applicants table found. Create or restore the database before running this migration.",
      );
    }

    // 1b) Legacy rename: website_applicants → flolabs_users when users was already renamed
    const hasFlolabsAfter = await tableExists(sql, "flolabs_users");
    const hasWebsiteAfter = await tableExists(sql, "website_applicants");
    if (hasFlolabsAfter && hasWebsiteAfter) {
      await run(
        sql,
        "rename duplicate website_applicants → website_applicants_legacy",
        `alter table website_applicants rename to website_applicants_legacy`,
      );
      console.log(
        "NOTE: website_applicants_legacy retained — merge rows into flolabs_users manually if needed, then drop legacy.",
      );
    }

    for (const stmt of FLOLABS_USER_COLUMNS_SQL.split(";").map((s) => s.trim()).filter(Boolean)) {
      await run(sql, stmt.slice(0, 70), stmt + ";");
    }

    await ensureFlolabsIndexes(sql);

    // 2) Backfill name from first/last after Hephaestus/Chronos columns exist
    await run(
      sql,
      "backfill flolabs_users.name from first_name/last_name when null",
      `update flolabs_users u
       set name = trim(both ' ' from concat(coalesce(u.first_name, ''), ' ', coalesce(u.last_name, '')))
       where (u.name is null or trim(u.name) = '')
         and (coalesce(u.first_name, '') <> '' or coalesce(u.last_name, '') <> '')`,
    );

    // 3) Drop FKs, align applicant UUIDs → Chronos user ids, remap/clean Hephaestus conversations, null orphans, re-add FKs
    await dropWebsiteApplicantConversationForeignKeys(sql);
    if (hasApplicants) {
      await dropForeignKeysReferencingTable(sql, "applicants");
    }
    await dropApplicantForeignKeys(sql);
    await alignAndCleanUserRefs(sql, hasApplicants);
    await addApplicantForeignKeys(sql);
    await addWebsiteApplicantConversationForeignKey(sql);

    console.log("\nMigration phase complete.");
    if (hasApplicants && !dryRun) {
      console.log(
        "The `applicants` table still exists. After verifying data, drop it manually:\n" +
          "  -- ensure no FKs reference applicants\n" +
          "  drop table if exists applicants cascade;",
      );
    }
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
