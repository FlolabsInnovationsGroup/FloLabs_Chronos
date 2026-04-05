import type { TimeEntry } from "@/types";
import { getNotionConfig } from "@/lib/app-config";

const NOTION_API_BASE = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";
const NOTION_TEMPLATE_VERSION = "2026-03-11";

interface NotionDatabaseProperty {
  type: string;
}

interface NotionBlockResult {
  id: string;
  type: string;
}

interface NotionDatabaseResponse {
  properties: Record<string, NotionDatabaseProperty>;
}

interface NotionTitleFragment {
  plain_text?: string;
}

interface NotionPagePropertyValue {
  type: string;
  title?: NotionTitleFragment[];
  rich_text?: NotionTitleFragment[];
  email?: string | null;
  relation?: Array<{ id: string }>;
  status?: { name?: string | null };
  number?: number | null;
}

interface NotionPageResult {
  id: string;
  archived?: boolean;
  parent?: { type?: string; database_id?: string };
  properties?: Record<string, NotionPagePropertyValue>;
}

function normalizeTaskQuery(query: string) {
  return query.trim().toLowerCase();
}

function getPageTitle(page: NotionPageResult): string {
  const titleProp = Object.values(page.properties ?? {}).find((prop) => prop.type === "title");
  const title = titleProp?.title?.map((t) => t.plain_text ?? "").join("").trim();
  return title || "Untitled task";
}

function matchesTaskQuery(title: string, query: string) {
  if (!query) return true;
  const normalizedTitle = title.toLowerCase();
  const normalizedQuery = normalizeTaskQuery(query);
  return normalizedTitle.includes(normalizedQuery);
}

async function queryTaskPages(params: {
  databaseId: string;
  pageSize: number;
  filterPropertyName?: string | null;
  query?: string;
  startCursor?: string;
}) {
  const { databaseId, pageSize, filterPropertyName, query, startCursor } = params;
  const trimmedQuery = query?.trim() ?? "";

  const body: Record<string, unknown> = {
    page_size: pageSize,
  };

  if (startCursor) {
    body.start_cursor = startCursor;
  }

  if (trimmedQuery && filterPropertyName) {
    body.filter = {
      property: filterPropertyName,
      title: {
        contains: trimmedQuery,
      },
    };
  }

  const res = await fetch(`${NOTION_API_BASE}/databases/${databaseId}/query`, {
    method: "POST",
    headers: notionHeaders(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    return {
      ok: false as const,
      status: res.status,
      errorText,
      data: null,
    };
  }

  const data = (await res.json()) as {
    results: NotionPageResult[];
    has_more?: boolean;
    next_cursor?: string | null;
  };

  return {
    ok: true as const,
    status: res.status,
    errorText: "",
    data,
  };
}

async function fallbackTaskSearch(databaseId: string, query: string): Promise<{ id: string; title: string }[]> {
  const normalizedQuery = normalizeTaskQuery(query);
  const matches: { id: string; title: string }[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined;
  let pagesScanned = 0;
  const maxPagesToScan = normalizedQuery.length <= 1 ? 8 : 4;

  do {
    const response = await queryTaskPages({
      databaseId,
      pageSize: 100,
      startCursor: cursor,
    });

    if (!response.ok || !response.data) break;

    for (const page of response.data.results) {
      const title = getPageTitle(page);
      if (!matchesTaskQuery(title, normalizedQuery)) continue;
      if (seen.has(page.id)) continue;
      seen.add(page.id);
      matches.push({ id: page.id, title });
      if (matches.length >= 10) return matches;
    }

    pagesScanned += 1;
    cursor = response.data.has_more && response.data.next_cursor ? response.data.next_cursor : undefined;
  } while (cursor && pagesScanned < maxPagesToScan);

  return matches;
}

export async function searchTasks(query: string): Promise<{ id: string; title: string }[]> {
  const dbId = process.env.NOTION_TASKS_DB_ID;
  if (!dbId || !process.env.NOTION_API_KEY) return [];

  const trimmedQuery = query.trim();

  try {
    const schema = await getDatabaseSchema(dbId);
    const titleProperty = findPropertyName(schema.properties, ["Name", "Title", "Task", "Task Name"], ["title"]);

    const primary = await queryTaskPages({
      databaseId: dbId,
      pageSize: 10,
      filterPropertyName: titleProperty,
      query: trimmedQuery,
    });

    if (primary.ok && primary.data) {
      const mapped = primary.data.results
        .map((page) => ({ id: page.id, title: getPageTitle(page) }))
        .filter((task) => matchesTaskQuery(task.title, trimmedQuery));

      if (mapped.length > 0 || !trimmedQuery) {
        return mapped.slice(0, 10);
      }
    }

    return await fallbackTaskSearch(dbId, trimmedQuery);
  } catch {
    return [];
  }
}

const databaseSchemaPromises = new Map<string, Promise<NotionDatabaseResponse>>();

function notionHeaders(version = NOTION_VERSION, apiKey = process.env.NOTION_API_KEY) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "Notion-Version": version,
  };
}

async function getDatabaseSchema(databaseId: string, version = NOTION_VERSION, apiKey = process.env.NOTION_API_KEY) {
  const cacheKey = `${apiKey ?? "default"}:${version}:${databaseId}`;
  const cached = databaseSchemaPromises.get(cacheKey);
  if (cached) return cached;

  const promise = fetch(`${NOTION_API_BASE}/databases/${databaseId}`, {
    headers: notionHeaders(version, apiKey),
  }).then(async (res) => {
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Notion schema lookup failed: ${err}`);
    }

    return (await res.json()) as NotionDatabaseResponse;
  });

  databaseSchemaPromises.set(cacheKey, promise);
  return promise;
}

async function queryAllDatabasePages(databaseId: string, notionApiKey: string): Promise<NotionPageResult[]> {
  const results: NotionPageResult[] = [];
  let cursor: string | undefined;

  do {
    const body: Record<string, unknown> = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;

    const res = await fetch(`${NOTION_API_BASE}/databases/${databaseId}/query`, {
      method: "POST",
      headers: notionHeaders(NOTION_VERSION, notionApiKey),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => "");
      throw new Error(`Notion query failed: ${err || res.statusText}`);
    }

    const data = (await res.json()) as {
      results: NotionPageResult[];
      has_more: boolean;
      next_cursor: string | null;
    };

    results.push(...data.results);
    cursor = data.has_more && data.next_cursor ? data.next_cursor : undefined;
  } while (cursor);

  return results;
}

async function queryAllBlockChildren(blockId: string, notionApiKey: string): Promise<NotionBlockResult[]> {
  const results: NotionBlockResult[] = [];
  let cursor: string | undefined;

  do {
    const url = new URL(`${NOTION_API_BASE}/blocks/${blockId}/children`);
    url.searchParams.set("page_size", "100");
    if (cursor) url.searchParams.set("start_cursor", cursor);

    const res = await fetch(url, {
      headers: notionHeaders(NOTION_VERSION, notionApiKey),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => "");
      throw new Error(`Notion block children lookup failed: ${err || res.statusText}`);
    }

    const data = (await res.json()) as {
      results: NotionBlockResult[];
      has_more: boolean;
      next_cursor: string | null;
    };

    results.push(...data.results);
    cursor = data.has_more && data.next_cursor ? data.next_cursor : undefined;
  } while (cursor);

  return results;
}

function findPropertyName(
  properties: Record<string, NotionDatabaseProperty>,
  preferredNames: string[],
  acceptedTypes: string[]
) {
  for (const name of preferredNames) {
    const property = properties[name];
    if (property && acceptedTypes.includes(property.type)) return name;
  }

  return Object.entries(properties).find(([, property]) => acceptedTypes.includes(property.type))?.[0];
}

function buildTitleValue(content: string) {
  return {
    title: [
      {
        text: {
          content,
        },
      },
    ],
  };
}

function buildRichTextValue(content: string) {
  return {
    rich_text: [
      {
        text: {
          content,
        },
      },
    ],
  };
}

function buildEmailValue(content: string) {
  return {
    email: content,
  };
}

function buildRelationValue(ids: string[]) {
  return {
    relation: ids.map((id) => ({ id })),
  };
}

function buildStatusValue(name: string) {
  return {
    status: {
      name,
    },
  };
}

function buildSelectLikeValue(type: string, content: string) {
  if (type === "select") {
    return {
      select: {
        name: content,
      },
    };
  }

  if (type === "multi_select") {
    return {
      multi_select: [{ name: content }],
    };
  }

  return buildRichTextValue(content);
}

/**
 * Creates or updates a Notion page for a time entry.
 * Returns the Notion page ID.
 *
 * Expected Notion database schema:
 *   Description  — Title
 *   User         — Select
 *   Project      — Select
 *   Tag          — Select
 *   Started      — Date
 *   Stopped      — Date
 *   Duration (h) — Number
 *   FL-Chron ID  — Rich Text (used for deduplication)
 */
export async function syncEntryToNotion(entry: TimeEntry): Promise<string> {
  const dbId = process.env.NOTION_DATABASE_ID;
  if (!dbId) throw new Error("NOTION_DATABASE_ID is not set");
  if (!process.env.NOTION_API_KEY) throw new Error("NOTION_API_KEY is not set");

  const schema = await getDatabaseSchema(dbId);
  const dbProperties = schema.properties;
  const durationHours =
    entry.durationMs ? Math.round((entry.durationMs / 3_600_000) * 100) / 100 : 0;

  const properties: Record<string, unknown> = {
    // filled dynamically below based on the actual database schema
  };

  const titleProperty = findPropertyName(dbProperties, ["Description", "Name", "Title", "User Key"], ["title"]);
  if (!titleProperty) {
    throw new Error("Notion database has no writable title property");
  }

  properties[titleProperty] = buildTitleValue(entry.description || "Untitled session");

  const descriptionProperty = findPropertyName(dbProperties, ["Description", "Notes", "Summary"], ["rich_text"]);
  if (descriptionProperty && descriptionProperty !== titleProperty) {
    properties[descriptionProperty] = buildRichTextValue(entry.description || "Untitled session");
  }

  const projectProperty = findPropertyName(dbProperties, ["Project"], ["select", "multi_select", "rich_text"]);
  if (projectProperty) {
    properties[projectProperty] = buildSelectLikeValue(
      dbProperties[projectProperty].type,
      entry.project?.name ?? entry.projectId ?? "No project"
    );
  }

  const userProperty = findPropertyName(dbProperties, ["User"], ["select", "multi_select", "rich_text"]);
  if (userProperty) {
    properties[userProperty] = buildSelectLikeValue(
      dbProperties[userProperty].type,
      entry.user?.name ?? entry.userId
    );
  }

  const tagProperty = findPropertyName(dbProperties, ["Tag", "Tags"], ["select", "multi_select", "rich_text"]);
  const firstTag = (entry.tags ?? [])[0];
  if (tagProperty && firstTag?.name) {
    properties[tagProperty] = buildSelectLikeValue(dbProperties[tagProperty].type, firstTag.name);
  }

  const combinedDateProperty = findPropertyName(dbProperties, ["Date", "Started"], ["date"]);
  if (combinedDateProperty) {
    properties[combinedDateProperty] = {
      date: {
        start: new Date(entry.startedAt).toISOString(),
        end: entry.stoppedAt ? new Date(entry.stoppedAt).toISOString() : undefined,
      },
    };
  }

  const stoppedProperty = findPropertyName(dbProperties, ["Stopped"], ["date"]);
  if (stoppedProperty && stoppedProperty !== combinedDateProperty && entry.stoppedAt) {
    properties[stoppedProperty] = {
      date: {
        start: new Date(entry.stoppedAt).toISOString(),
      },
    };
  }

  const durationProperty = findPropertyName(dbProperties, ["Duration (h)", "Duration"], ["number"]);
  if (durationProperty) {
    properties[durationProperty] = {
      number: durationHours,
    };
  }

  const updatedProperty = findPropertyName(dbProperties, ["Updated"], ["date"]);
  if (updatedProperty) {
    properties[updatedProperty] = {
      date: {
        start: new Date(entry.updatedAt ?? entry.startedAt).toISOString(),
      },
    };
  }

  const chronosIdProperty = findPropertyName(dbProperties, ["Chronos ID", "FL-Chron ID"], ["rich_text"]);
  if (chronosIdProperty) {
    properties[chronosIdProperty] = buildRichTextValue(entry.id);
  }

  if (entry.notionPageId) {
    const res = await fetch(`${NOTION_API_BASE}/pages/${entry.notionPageId}`, {
      method: "PATCH",
      headers: notionHeaders(),
      body: JSON.stringify({ properties }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Notion update failed: ${err}`);
    }

    return entry.notionPageId;
  }

  const res = await fetch(`${NOTION_API_BASE}/pages`, {
    method: "POST",
    headers: notionHeaders(),
    body: JSON.stringify({
      parent: { database_id: dbId },
      properties,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Notion create failed: ${err}`);
  }

  const page = (await res.json()) as { id: string };
  return page.id;
}

// ---------------------------------------------------------------------------
// Full sync helpers (used by the notion-sync cron)
// ---------------------------------------------------------------------------

type FullEntry = TimeEntry & {
  user?: { name: string; email?: string };
  project?: { name: string };
  tags?: { id: string; name: string }[];
};

export function normalizeNotionId(id: string): string {
  return id.replace(/-/g, "").toLowerCase();
}

function normalizeName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeEmailValue(email: string): string {
  return email.trim().toLowerCase();
}

interface TeamMemberDirectoryEntry {
  id: string;
  name: string;
  normalizedName: string;
  email: string | null;
  personalEmail: string | null;
  normalizedEmails: string[];
  teamRelationIds: string[];
  onboardingRelationIds: string[];
}

interface TeamMemberDirectory {
  entries: TeamMemberDirectoryEntry[];
}

export class TeamMemberLookupConflictError extends Error {
  readonly matches: Array<{ id: string; name: string; email: string | null }>;

  constructor(message: string, matches: Array<{ id: string; name: string; email: string | null }>) {
    super(message);
    this.name = "TeamMemberLookupConflictError";
    this.matches = matches;
  }
}

const TEAM_MEMBER_DIRECTORY_KEY = "notion:team-member-directory";
const TEAM_INDEX_TTL = 7200;

async function cacheGet(key: string): Promise<string | null> {
  try {
    const { kvGet } = await import("@/lib/redis-cache");
    return kvGet(key);
  } catch {
    return null;
  }
}

async function cacheSet(key: string, value: string, ttl: number): Promise<void> {
  try {
    const { kvSet } = await import("@/lib/redis-cache");
    await kvSet(key, value, ttl);
  } catch {
    // cache not available — non-fatal
  }
}

function getTitleFromProperty(prop: NotionPagePropertyValue | undefined): string {
  if (!prop) return "";
  if (prop.type === "title") {
    return prop.title?.map((t) => t.plain_text ?? "").join("").trim() ?? "";
  }
  if (prop.type === "rich_text") {
    return prop.rich_text?.map((t) => t.plain_text ?? "").join("").trim() ?? "";
  }
  return "";
}

function getPageName(page: NotionPageResult): string {
  const titleProp = Object.values(page.properties ?? {}).find((prop) => prop.type === "title");
  return getTitleFromProperty(titleProp) || "Untitled";
}

function serializeTeamMemberDirectory(directory: TeamMemberDirectory) {
  return JSON.stringify(directory);
}

function deserializeTeamMemberDirectory(raw: string): TeamMemberDirectory | null {
  try {
    const parsed = JSON.parse(raw) as TeamMemberDirectory;
    if (!parsed || !Array.isArray(parsed.entries)) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function buildTeamMemberDirectory(): Promise<TeamMemberDirectory> {
  const { notionApiKey, notionTeamMembersDbId } = await getNotionConfig();
  const dbId = notionTeamMembersDbId;
  if (!notionApiKey || !dbId) return { entries: [] };

  const entries: TeamMemberDirectoryEntry[] = [];
  let cursor: string | undefined;

  do {
    const body: Record<string, unknown> = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;

    const res = await fetch(`${NOTION_API_BASE}/databases/${dbId}/query`, {
      method: "POST",
      headers: notionHeaders(NOTION_VERSION, notionApiKey),
      body: JSON.stringify(body),
    });

    if (!res.ok) break;

    const data = (await res.json()) as {
      results: NotionPageResult[];
      has_more: boolean;
      next_cursor: string | null;
    };

    for (const page of data.results) {
      const name = getPageName(page);
      const email = page.properties?.Email?.type === "email"
        ? page.properties.Email.email?.trim() ?? null
        : null;
      const personalEmail = page.properties?.["Personal Email"]?.type === "email"
        ? page.properties["Personal Email"].email?.trim() ?? null
        : null;
      const normalizedEmails = [email, personalEmail]
        .filter((value): value is string => Boolean(value?.trim()))
        .map((value) => normalizeEmailValue(value));
      const teamRelationIds = page.properties?.Team?.type === "relation"
        ? (page.properties.Team.relation ?? []).map((relation) => relation.id)
        : [];
      const onboardingRelationIds = page.properties?.Onboarding?.type === "relation"
        ? (page.properties.Onboarding.relation ?? []).map((relation) => relation.id)
        : [];

      entries.push({
        id: page.id,
        name,
        normalizedName: normalizeName(name),
        email,
        personalEmail,
        normalizedEmails,
        teamRelationIds,
        onboardingRelationIds,
      });
    }

    cursor = data.has_more && data.next_cursor ? data.next_cursor : undefined;
  } while (cursor);

  const directory = { entries };
  await cacheSet(TEAM_MEMBER_DIRECTORY_KEY, serializeTeamMemberDirectory(directory), TEAM_INDEX_TTL);

  return directory;
}

async function getTeamMemberDirectory(): Promise<TeamMemberDirectory> {
  const cached = await cacheGet(TEAM_MEMBER_DIRECTORY_KEY);
  if (cached) {
    const directory = deserializeTeamMemberDirectory(cached);
    if (directory) return directory;
  }

  return buildTeamMemberDirectory();
}

async function verifyTeamMemberBelongsToTeamMembersDatabase(
  pageId: string,
  notionTeamMembersDbId: string,
  notionApiKey: string
): Promise<NotionPageResult> {
  const page = await retrievePage(pageId, notionApiKey);
  if (!page || page.archived) {
    throw new Error("Team Member page was not found or is archived.");
  }
  const parent = page.parent;
  if (parent?.type !== "database_id" || !parent.database_id) {
    throw new Error("This page is not a row in a Notion database.");
  }
  if (normalizeNotionId(parent.database_id) !== normalizeNotionId(notionTeamMembersDbId)) {
    throw new Error("This page is not in the configured Team Members database.");
  }
  return page;
}

function teamMemberInviteEmailsFromPage(page: NotionPageResult): string[] {
  const email = page.properties?.Email?.type === "email" ? page.properties.Email.email?.trim() ?? "" : "";
  const personal =
    page.properties?.["Personal Email"]?.type === "email" ? page.properties["Personal Email"].email?.trim() ?? "" : "";
  const set = new Set<string>();
  if (email) set.add(normalizeEmailValue(email));
  if (personal) set.add(normalizeEmailValue(personal));
  return [...set].filter(Boolean);
}

async function assertTeamMemberPageEligibleForInvite(
  pageId: string,
  inviteEmail: string,
  notionApiKey: string,
  notionTeamMembersDbId: string
): Promise<void> {
  const page = await verifyTeamMemberBelongsToTeamMembersDatabase(pageId, notionTeamMembersDbId, notionApiKey);
  const normalizedInvite = normalizeEmailValue(inviteEmail);
  const known = teamMemberInviteEmailsFromPage(page);
  if (known.length > 0 && !known.includes(normalizedInvite)) {
    const title = getPageName(page);
    throw new TeamMemberLookupConflictError(
      `The selected Team Member page "${title}" has an email that does not match the invitation email "${inviteEmail}". Pick a different page or fix the email on that Notion page.`,
      [{ id: page.id, name: title, email: page.properties?.Email?.type === "email" ? page.properties.Email.email ?? null : null }]
    );
  }
}

/** Email, display name, and Team relation page IDs from a Team Members DB row (for invite flows). */
export async function getInviteSourceFromNotionTeamMemberPage(pageId: string): Promise<{
  email: string;
  name: string;
  notionTeamPageIds: string[];
}> {
  const { notionApiKey, notionTeamMembersDbId } = await getNotionConfig();
  if (!notionApiKey || !notionTeamMembersDbId) {
    throw new Error("Notion Team Members database is not configured.");
  }

  const page = await verifyTeamMemberBelongsToTeamMembersDatabase(pageId, notionTeamMembersDbId, notionApiKey);

  const emailProp = page.properties?.Email?.type === "email" ? page.properties.Email.email?.trim() ?? "" : "";
  const personalProp =
    page.properties?.["Personal Email"]?.type === "email" ? page.properties["Personal Email"].email?.trim() ?? "" : "";
  const primaryEmail = emailProp || personalProp;
  if (!primaryEmail) {
    throw new Error(
      "This Team Member page has no email in Notion. Add an Email (or Personal Email) property before inviting."
    );
  }

  const teamProperty = page.properties?.Team;
  const notionTeamPageIds =
    teamProperty?.type === "relation" ? (teamProperty.relation ?? []).map((relation) => relation.id).filter(Boolean) : [];
  if (notionTeamPageIds.length === 0) {
    throw new Error("This Team Member page has no Team relations in Notion. Link at least one team before inviting.");
  }

  return {
    email: primaryEmail,
    name: getPageName(page),
    notionTeamPageIds,
  };
}

/** Ensures a page ID is a non-archived row in the configured Team Members database (admin linking). */
export async function verifyNotionTeamMemberPageRow(pageId: string): Promise<void> {
  const { notionApiKey, notionTeamMembersDbId } = await getNotionConfig();
  if (!notionApiKey || !notionTeamMembersDbId) {
    throw new Error("Notion Team Members database is not configured.");
  }
  await verifyTeamMemberBelongsToTeamMembersDatabase(pageId, notionTeamMembersDbId, notionApiKey);
}

/** Search cached Team Member directory by title or email (substring, case-insensitive). */
export async function searchTeamMemberPages(
  query: string,
  limit = 40
): Promise<Array<{ id: string; name: string; email: string | null }>> {
  const { notionApiKey, notionTeamMembersDbId } = await getNotionConfig();
  if (!notionApiKey || !notionTeamMembersDbId) return [];

  const directory = await getTeamMemberDirectory();
  const q = query.trim().toLowerCase();
  const cap = Math.min(Math.max(1, limit), 60);

  let list = directory.entries;
  if (q) {
    list = list.filter((entry) => {
      if (entry.name.toLowerCase().includes(q)) return true;
      if (entry.email?.toLowerCase().includes(q)) return true;
      if (entry.personalEmail?.toLowerCase().includes(q)) return true;
      return false;
    });
  }

  list = [...list].sort((a, b) => a.name.localeCompare(b.name));
  return list.slice(0, cap).map((e) => ({
    id: e.id,
    name: e.name,
    email: e.email ?? e.personalEmail ?? null,
  }));
}

export function buildNotionEntryProperties(
  entry: FullEntry,
  teamMemberPageId: string | null,
  status: string,
  dbProperties?: Record<string, NotionDatabaseProperty>
): Record<string, unknown> {
  const durationSecs = entry.durationMs ? Math.round(entry.durationMs / 1000) : 0;
  const tagNames = (entry.tags ?? []).map((t) => t.name);
  const userKey = entry.user?.name
    ? `${entry.user.name} — ${new Date(entry.startedAt).toISOString().split("T")[0]}`
    : entry.id;

  const properties: Record<string, unknown> = {};
  const schema = dbProperties ?? {};

  const userKeyType = schema["User Key"]?.type;
  properties["User Key"] = userKeyType === "rich_text" ? buildRichTextValue(userKey) : buildTitleValue(userKey);

  const entryIdType = schema["Entry ID"]?.type;
  if (entryIdType === "number") {
    const numericId = Number.parseInt(entry.id.replace(/[^0-9]/g, "").slice(0, 15) || "0", 10);
    if (Number.isFinite(numericId) && numericId > 0) {
      properties["Entry ID"] = { number: numericId };
    }
  } else if (entryIdType === "rich_text") {
    properties["Entry ID"] = buildRichTextValue(entry.id);
  }

  properties["Project"] = { select: { name: entry.project?.name ?? "Unknown" } };
  properties["Tags"] = { multi_select: tagNames.map((n) => ({ name: n })) };
  properties["Date"] = {
    date: {
      start: new Date(entry.startedAt).toISOString(),
      end: entry.stoppedAt ? new Date(entry.stoppedAt).toISOString() : undefined,
    },
  };
  properties["Updated"] = {
    date: { start: new Date(entry.updatedAt ?? entry.startedAt).toISOString() },
  };
  properties["Duration"] = { number: durationSecs };
  properties["Description"] = buildRichTextValue(entry.description || "");
  properties["Status"] = { status: { name: status } };

  if (teamMemberPageId && schema["Team Member"]?.type === "relation") {
    properties["Team Member"] = { relation: [{ id: teamMemberPageId }] };
  }

  const taskPageId = (entry as TimeEntry & { notionTaskPageId?: string | null }).notionTaskPageId;
  if (taskPageId && schema["Task"]?.type === "relation") {
    properties["Task"] = { relation: [{ id: taskPageId }] };
  }

  return properties;
}

export async function syncEntryToNotionFull(entry: FullEntry): Promise<string | null> {
  const dbId = process.env.NOTION_DATABASE_ID;
  if (!dbId || !process.env.NOTION_API_KEY) return null;

  const isNew = !entry.notionPageId;
  const status = isNew ? "Processed" : "Edited";

  const teamMemberPageId =
    (entry.user as { notionTeamMemberId?: string | null } | undefined)?.notionTeamMemberId?.trim() || null;

  const schema = await getDatabaseSchema(dbId);
  const properties = buildNotionEntryProperties(entry, teamMemberPageId, status, schema.properties);

  if (!isNew) {
    const res = await fetch(`${NOTION_API_BASE}/pages/${entry.notionPageId}`, {
      method: "PATCH",
      headers: notionHeaders(),
      body: JSON.stringify({ properties }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Notion update failed: ${err}`);
    }
    return entry.notionPageId!;
  }

  const res = await fetch(`${NOTION_API_BASE}/pages`, {
    method: "POST",
    headers: notionHeaders(),
    body: JSON.stringify({ parent: { database_id: dbId }, properties }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Notion create failed: ${err}`);
  }
  const page = (await res.json()) as { id: string };
  return page.id;
}

export async function updateTeamMemberName(notionPageId: string, name: string): Promise<void> {
  if (!process.env.NOTION_API_KEY) return;
  await fetch(`${NOTION_API_BASE}/pages/${notionPageId}`, {
    method: "PATCH",
    headers: notionHeaders(),
    body: JSON.stringify({
      properties: {
        Name: { title: [{ text: { content: name } }] },
      },
    }),
  });
}

export async function updateTeamMemberTimeCommitment(notionPageId: string, weeklyHours: number): Promise<void> {
  const { notionApiKey, notionTeamMembersDbId } = await getNotionConfig();
  if (!notionApiKey || !notionTeamMembersDbId) return;

  const schema = await getDatabaseSchema(notionTeamMembersDbId, NOTION_VERSION, notionApiKey);
  const timeCommitmentType = schema.properties?.["Time Commitment"]?.type;
  if (!timeCommitmentType || !["number", "rich_text"].includes(timeCommitmentType)) {
    throw new Error('Team Members database is missing a writable "Time Commitment" property.');
  }

  const propertyValue =
    timeCommitmentType === "number"
      ? { number: weeklyHours }
      : {
          rich_text: [
            {
              text: {
                content: String(weeklyHours),
              },
            },
          ],
        };

  const res = await fetch(`${NOTION_API_BASE}/pages/${notionPageId}`, {
    method: "PATCH",
    headers: notionHeaders(NOTION_VERSION, notionApiKey),
    body: JSON.stringify({
      properties: {
        "Time Commitment": propertyValue,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`Notion update failed: ${err || res.statusText}`);
  }
}

function findTeamMembersRolePropertyName(properties: Record<string, NotionDatabaseProperty>): string | null {
  const candidates = ["Role", "Chronos Role", "App Role", "Chronos role"];
  for (const name of candidates) {
    const p = properties[name];
    if (p && (p.type === "select" || p.type === "status")) return name;
  }
  return null;
}

/** Sync Chronos role to Notion Team Members `Role` (or `Chronos Role` / `App Role`) select or status when option names match. */
export async function updateTeamMemberRoleInNotion(
  notionPageId: string,
  chronosRole: "admin" | "team_lead" | "member"
): Promise<void> {
  const { notionApiKey, notionTeamMembersDbId } = await getNotionConfig();
  if (!notionApiKey || !notionTeamMembersDbId) return;

  const schema = await getDatabaseSchema(notionTeamMembersDbId, NOTION_VERSION, notionApiKey);
  const propName = findTeamMembersRolePropertyName(schema.properties);
  if (!propName) return;

  const raw = schema.properties[propName] as NotionDatabaseProperty & {
    select?: { options?: Array<{ name: string }> };
    status?: { options?: Array<{ name: string }> };
  };

  const optionNames =
    raw.type === "select"
      ? (raw.select?.options ?? []).map((o) => o.name).filter(Boolean)
      : raw.type === "status"
        ? (raw.status?.options ?? []).map((o) => o.name).filter(Boolean)
        : [];

  if (optionNames.length === 0) return;

  const tryNames =
    chronosRole === "admin"
      ? ["Admin", "admin", "Administrator"]
      : chronosRole === "team_lead"
        ? ["Team Lead", "Team lead", "team_lead", "Lead"]
        : ["Member", "member"];

  const matched =
    tryNames.find((c) => optionNames.includes(c)) ??
    optionNames.find((n) => n.replace(/\s+/g, "_").toLowerCase() === chronosRole);

  if (!matched) return;

  const properties: Record<string, unknown> =
    raw.type === "select"
      ? { [propName]: { select: { name: matched } } }
      : { [propName]: { status: { name: matched } } };

  await patchPageProperties({
    pageId: notionPageId,
    notionApiKey,
    properties,
  });
}

interface TeamMemberTemplatePreference {
  type: "default" | "template_id";
  template_id?: string;
  timezone?: string;
}

interface CreateTeamMemberPageParams {
  email: string;
  name: string;
  notionTeamPageIds: string[];
  /** When set, this exact Team Members row is updated (no fuzzy matching). */
  notionTeamMemberPageId?: string | null;
  /** When true, always create a new Team Members row (Onboarding + Masterclasses still run). */
  forceCreateNew?: boolean;
}

interface CreateTeamMemberPageResult {
  pageId: string;
  templateApplied: boolean;
  templateMode: "default" | "template_id" | "none";
  reusedExisting?: boolean;
  matchedBy?: "explicit";
}

interface NotionDatabaseLookupResponse {
  data_sources?: Array<{ id: string }>;
}

interface GenericCreatePageResult {
  pageId: string;
  templateApplied: boolean;
  templateMode: "default" | "template_id" | "none";
}

function buildTeamMemberProperties(params: CreateTeamMemberPageParams) {
  return {
    Name: buildTitleValue(params.name),
    Email: buildEmailValue(params.email),
    Team: buildRelationValue(params.notionTeamPageIds),
    Status: buildStatusValue("Onboarding"),
  };
}

async function patchPageProperties(params: {
  pageId: string;
  notionApiKey: string;
  properties: Record<string, unknown>;
}): Promise<void> {
  if (Object.keys(params.properties).length === 0) return;

  const res = await fetch(`${NOTION_API_BASE}/pages/${params.pageId}`, {
    method: "PATCH",
    headers: notionHeaders(NOTION_VERSION, params.notionApiKey),
    body: JSON.stringify({ properties: params.properties }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`Notion update failed: ${err || res.statusText}`);
  }
}

async function updateExistingTeamMemberPage(params: {
  pageId: string;
  notionApiKey: string;
  notionOnboardingsDbId: string | null;
  email: string;
  name: string;
  notionTeamPageIds: string[];
}): Promise<void> {
  const page = await retrievePage(params.pageId, params.notionApiKey);
  if (!page) {
    throw new Error("Failed to load the existing Notion Team Member page before updating it.");
  }

  const patch: Record<string, unknown> = {};
  const emailProperty = page.properties?.Email;
  const existingEmail = emailProperty?.type === "email" ? emailProperty.email?.trim() ?? "" : "";
  if (emailProperty?.type === "email" && !existingEmail) {
    patch.Email = buildEmailValue(params.email);
  }

  const teamProperty = page.properties?.Team;
  if (teamProperty?.type === "relation") {
    const prevIds = (teamProperty.relation ?? []).map((relation) => relation.id).filter(Boolean);
    const byNorm = new Map<string, string>();
    for (const id of prevIds) {
      byNorm.set(normalizeNotionId(id), id);
    }
    for (const teamPageId of params.notionTeamPageIds) {
      const norm = normalizeNotionId(teamPageId);
      if (!byNorm.has(norm)) {
        byNorm.set(norm, teamPageId);
      }
    }
    const merged = [...byNorm.values()];
    const prevNormKey = [...new Set(prevIds.map(normalizeNotionId))].sort().join(",");
    const mergedNormKey = [...new Set(merged.map(normalizeNotionId))].sort().join(",");
    if (prevNormKey !== mergedNormKey) {
      patch.Team = buildRelationValue(merged);
    }
  }

  const currentTitle = getPageName(page);
  if (params.name.trim() && normalizeName(params.name) !== normalizeName(currentTitle)) {
    patch.Name = buildTitleValue(params.name.trim());
  }

  const statusProperty = page.properties?.Status;
  if (statusProperty?.type === "status" && !statusProperty.status?.name) {
    patch.Status = buildStatusValue("Onboarding");
  }

  await patchPageProperties({
    pageId: params.pageId,
    notionApiKey: params.notionApiKey,
    properties: patch,
  });

  const onboardingProperty = page.properties?.Onboarding;
  const hasOnboardingRelation = onboardingProperty?.type === "relation" && (onboardingProperty.relation ?? []).length > 0;
  if (!hasOnboardingRelation) {
    await ensureOnboardingPageLinkedToTeamMember({
      teamMemberPageId: params.pageId,
      name: params.name,
      email: params.email,
      notionApiKey: params.notionApiKey,
      notionOnboardingsDbId: params.notionOnboardingsDbId,
    });
  }

  await buildTeamMemberDirectory().catch(() => {});
}

async function getDatabaseDataSourceId(databaseId: string, notionApiKey: string): Promise<string | null> {
  const res = await fetch(`${NOTION_API_BASE}/databases/${databaseId}`, {
    headers: notionHeaders(NOTION_TEMPLATE_VERSION, notionApiKey),
  });

  if (!res.ok) return null;

  const data = (await res.json()) as NotionDatabaseLookupResponse;
  return data.data_sources?.[0]?.id ?? null;
}

function getTeamMemberTemplatePreference(): TeamMemberTemplatePreference {
  const templateId = process.env.NOTION_TEAM_MEMBER_TEMPLATE_ID?.trim();
  const timezone = process.env.NOTION_TEAM_MEMBER_TEMPLATE_TIMEZONE?.trim() || "UTC";

  if (templateId) {
    return { type: "template_id", template_id: templateId, timezone };
  }

  return { type: "default", timezone };
}

async function createPageWithTemplate(params: {
  dataSourceId: string;
  notionApiKey: string;
  properties: Record<string, unknown>;
  template: TeamMemberTemplatePreference;
}): Promise<GenericCreatePageResult | null> {
  const res = await fetch(`${NOTION_API_BASE}/pages`, {
    method: "POST",
    headers: notionHeaders(NOTION_TEMPLATE_VERSION, params.notionApiKey),
    body: JSON.stringify({
      parent: { data_source_id: params.dataSourceId },
      properties: params.properties,
      template: params.template,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const normalized = text.toLowerCase();
    const recoverable =
      res.status === 400 ||
      res.status === 404 ||
      res.status === 409 ||
      normalized.includes("template") ||
      normalized.includes("data_source_id") ||
      normalized.includes("validation_error");

    if (recoverable) return null;

    throw new Error(`Notion template create failed: ${text || res.statusText}`);
  }

  const page = (await res.json()) as { id: string };
  return {
    pageId: page.id,
    templateApplied: true,
    templateMode: params.template.type,
  };
}

async function createPageWithoutTemplate(params: {
  databaseId: string;
  notionApiKey: string;
  properties: Record<string, unknown>;
}): Promise<GenericCreatePageResult> {
  const res = await fetch(`${NOTION_API_BASE}/pages`, {
    method: "POST",
    headers: notionHeaders(NOTION_VERSION, params.notionApiKey),
    body: JSON.stringify({
      parent: { database_id: params.databaseId },
      properties: params.properties,
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`Notion create failed: ${err || res.statusText}`);
  }

  const page = (await res.json()) as { id: string };
  return {
    pageId: page.id,
    templateApplied: false,
    templateMode: "none",
  };
}

async function retrievePage(pageId: string, notionApiKey: string): Promise<NotionPageResult | null> {
  const res = await fetch(`${NOTION_API_BASE}/pages/${pageId}`, {
    headers: notionHeaders(NOTION_VERSION, notionApiKey),
  });

  if (!res.ok) return null;
  return (await res.json()) as NotionPageResult;
}

async function appendPageRelation(params: {
  pageId: string;
  propertyName: string;
  relatedPageId: string;
  notionApiKey: string;
}): Promise<void> {
  const page = await retrievePage(params.pageId, params.notionApiKey);
  const property = page?.properties?.[params.propertyName];

  if (!property || property.type !== "relation") {
    throw new Error(`Team Members database is missing the required relation property \"${params.propertyName}\".`);
  }

  const relationIds = new Set((property.relation ?? []).map((relation) => relation.id));
  relationIds.add(params.relatedPageId);

  const res = await fetch(`${NOTION_API_BASE}/pages/${params.pageId}`, {
    method: "PATCH",
    headers: notionHeaders(NOTION_VERSION, params.notionApiKey),
    body: JSON.stringify({
      properties: {
        [params.propertyName]: buildRelationValue([...relationIds]),
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`Notion relation update failed: ${err || res.statusText}`);
  }
}

async function createOnboardingPage(params: {
  databaseId: string;
  notionApiKey: string;
  name: string;
  email: string;
}): Promise<GenericCreatePageResult> {
  const schema = await getDatabaseSchema(params.databaseId);
  const titleProperty = findPropertyName(schema.properties, ["Name", "Title", "Onboarding", "Full Name"], ["title"]);

  if (!titleProperty) {
    throw new Error("Onboarding database has no writable title property.");
  }

  const properties: Record<string, unknown> = {
    [titleProperty]: buildTitleValue(params.name),
  };

  const emailProperty = findPropertyName(schema.properties, ["Email", "Personal Email"], ["email"]);
  if (emailProperty) {
    properties[emailProperty] = buildEmailValue(params.email);
  }

  const dataSourceId = await getDatabaseDataSourceId(params.databaseId, params.notionApiKey).catch(() => null);
  if (dataSourceId) {
    const templated = await createPageWithTemplate({
      dataSourceId,
      notionApiKey: params.notionApiKey,
      properties,
      template: { type: "default" },
    });
    if (templated) return templated;
  }

  return createPageWithoutTemplate({
    databaseId: params.databaseId,
    notionApiKey: params.notionApiKey,
    properties,
  });
}

async function ensureOnboardingPageLinkedToTeamMember(params: {
  teamMemberPageId: string;
  name: string;
  email: string;
  notionApiKey: string;
  notionOnboardingsDbId: string | null;
}): Promise<void> {
  if (!params.notionOnboardingsDbId) return;

  const onboarding = await createOnboardingPage({
    databaseId: params.notionOnboardingsDbId,
    notionApiKey: params.notionApiKey,
    name: params.name,
    email: params.email,
  });

  await appendPageRelation({
    pageId: params.teamMemberPageId,
    propertyName: "Onboarding",
    relatedPageId: onboarding.pageId,
    notionApiKey: params.notionApiKey,
  });
}

interface MasterClassIndexEntry {
  pageId: string;
  name: string;
  teamRelationIds: string[];
  targetDatabaseId: string | null;
}

function buildMasterClassPageTitle(fullName: string, masterClassName: string): string {
  return `${fullName.trim()}'s ${masterClassName.trim()}`;
}

async function resolvePageBackedDatabaseId(pageId: string, notionApiKey: string): Promise<string | null> {
  try {
    await getDatabaseSchema(pageId, NOTION_VERSION, notionApiKey);
    return pageId;
  } catch {
    // not a database id; keep going
  }

  const blocks = await queryAllBlockChildren(pageId, notionApiKey).catch(() => []);
  for (const block of blocks) {
    if (block.type !== "child_database") continue;
    try {
      await getDatabaseSchema(block.id, NOTION_VERSION, notionApiKey);
      return block.id;
    } catch {
      continue;
    }
  }

  return null;
}

async function loadMasterClassIndexEntries(params: {
  databaseId: string;
  notionApiKey: string;
}): Promise<MasterClassIndexEntry[]> {
  const pages = await queryAllDatabasePages(params.databaseId, params.notionApiKey);
  const entries = await Promise.all(
    pages.map(async (page) => ({
      pageId: page.id,
      name: getPageName(page),
      teamRelationIds:
        page.properties?.Teams?.type === "relation"
          ? (page.properties.Teams.relation ?? []).map((relation) => relation.id)
          : [],
      targetDatabaseId: await resolvePageBackedDatabaseId(page.id, params.notionApiKey),
    }))
  );

  return entries.filter((entry) => entry.teamRelationIds.length > 0 && Boolean(entry.targetDatabaseId));
}

async function ensureMasterClassPageInDatabase(params: {
  databaseId: string;
  teamMemberPageId: string;
  name: string;
  masterClassName: string;
  email: string;
  notionApiKey: string;
}): Promise<void> {
  const schema = await getDatabaseSchema(params.databaseId, NOTION_VERSION, params.notionApiKey);
  const titleProperty = findPropertyName(schema.properties, ["Name", "Title", "MasterClass", "Full Name"], ["title"]);

  if (!titleProperty) {
    throw new Error(`MasterClass database ${params.databaseId} has no writable title property.`);
  }

  const relationProperty = findPropertyName(
    schema.properties,
    ["Team Member", "Team Members", "Member", "User", "Users"],
    ["relation"]
  );
  const emailProperty = findPropertyName(schema.properties, ["Email", "Personal Email"], ["email"]);

  const existingPages = await queryAllDatabasePages(params.databaseId, params.notionApiKey);
  const canonicalTitle = buildMasterClassPageTitle(params.name, params.masterClassName);
  const normalizedName = normalizeName(params.name);
  const normalizedCanonicalTitle = normalizeName(canonicalTitle);
  const normalizedEmail = normalizeEmailValue(params.email);

  for (const page of existingPages) {
    const relationIds =
      relationProperty && page.properties?.[relationProperty]?.type === "relation"
        ? (page.properties[relationProperty].relation ?? []).map((relation) => relation.id)
        : [];
    const existingName = getPageName(page);
    const normalizedExistingName = normalizeName(existingName);

    const existingEmail =
      emailProperty && page.properties?.[emailProperty]?.type === "email"
        ? page.properties[emailProperty].email?.trim().toLowerCase() ?? null
        : null;
    const matchesExistingPage =
      relationIds.includes(params.teamMemberPageId) ||
      (existingEmail ? existingEmail === normalizedEmail : false) ||
      normalizedExistingName === normalizedCanonicalTitle ||
      normalizedExistingName === normalizedName;

    if (matchesExistingPage) {
      const patch: Record<string, unknown> = {};
      if (existingName !== canonicalTitle) {
        patch[titleProperty] = buildTitleValue(canonicalTitle);
      }
      if (emailProperty && !existingEmail) {
        patch[emailProperty] = buildEmailValue(params.email);
      }
      if (relationProperty && !relationIds.includes(params.teamMemberPageId)) {
        patch[relationProperty] = buildRelationValue([...new Set([...relationIds, params.teamMemberPageId])]);
      }
      await patchPageProperties({
        pageId: page.id,
        notionApiKey: params.notionApiKey,
        properties: patch,
      });
      return;
    }
  }

  const properties: Record<string, unknown> = {
    [titleProperty]: buildTitleValue(canonicalTitle),
  };

  if (emailProperty) {
    properties[emailProperty] = buildEmailValue(params.email);
  }

  if (relationProperty) {
    properties[relationProperty] = buildRelationValue([params.teamMemberPageId]);
  }

  const dataSourceId = await getDatabaseDataSourceId(params.databaseId, params.notionApiKey).catch(() => null);
  if (dataSourceId) {
    const templated = await createPageWithTemplate({
      dataSourceId,
      notionApiKey: params.notionApiKey,
      properties,
      template: { type: "default" },
    });
    if (templated) return;
  }

  await createPageWithoutTemplate({
    databaseId: params.databaseId,
    notionApiKey: params.notionApiKey,
    properties,
  });
}

async function ensureMasterClassPagesForTeamMember(params: {
  teamMemberPageId: string;
  name: string;
  email: string;
  notionApiKey: string;
  notionTeamPageIds: string[];
  notionMasterClassesIndexDbId: string | null;
}): Promise<void> {
  if (!params.notionMasterClassesIndexDbId || params.notionTeamPageIds.length === 0) return;

  const relevantTeamIds = new Set(params.notionTeamPageIds);
  const indexEntries = await loadMasterClassIndexEntries({
    databaseId: params.notionMasterClassesIndexDbId,
    notionApiKey: params.notionApiKey,
  });

  const targetDatabaseIds = new Set<string>();
  const targetDatabaseNames = new Map<string, string>();
  for (const entry of indexEntries) {
    if (!entry.targetDatabaseId) continue;
    if (!entry.teamRelationIds.some((teamId) => relevantTeamIds.has(teamId))) continue;
    targetDatabaseIds.add(entry.targetDatabaseId);
    if (!targetDatabaseNames.has(entry.targetDatabaseId)) {
      targetDatabaseNames.set(entry.targetDatabaseId, entry.name);
    }
  }

  for (const databaseId of targetDatabaseIds) {
    await ensureMasterClassPageInDatabase({
      databaseId,
      teamMemberPageId: params.teamMemberPageId,
      name: params.name,
      masterClassName: targetDatabaseNames.get(databaseId) ?? "MasterClass",
      email: params.email,
      notionApiKey: params.notionApiKey,
    });
  }
}

export async function ensureTeamMemberPage(params: CreateTeamMemberPageParams): Promise<CreateTeamMemberPageResult | null> {
  if (params.notionTeamPageIds.length === 0) {
    throw new Error("Cannot create Team Member page in Notion without Team relations.");
  }

  const { notionApiKey, notionOnboardingsDbId, notionTeamMembersDbId, notionMasterClassesIndexDbId } = await getNotionConfig();
  if (!notionApiKey || !notionTeamMembersDbId) return null;

  if (!params.notionTeamMemberPageId && !params.forceCreateNew) {
    throw new Error("ensureTeamMemberPage requires notionTeamMemberPageId or forceCreateNew.");
  }

  if (params.notionTeamMemberPageId) {
    await assertTeamMemberPageEligibleForInvite(
      params.notionTeamMemberPageId,
      params.email,
      notionApiKey,
      notionTeamMembersDbId
    );
    await updateExistingTeamMemberPage({
      pageId: params.notionTeamMemberPageId,
      notionApiKey,
      notionOnboardingsDbId,
      email: params.email,
      name: params.name,
      notionTeamPageIds: params.notionTeamPageIds,
    });

    await ensureMasterClassPagesForTeamMember({
      teamMemberPageId: params.notionTeamMemberPageId,
      name: params.name,
      email: params.email,
      notionApiKey,
      notionTeamPageIds: params.notionTeamPageIds,
      notionMasterClassesIndexDbId,
    });

    await buildTeamMemberDirectory().catch(() => {});

    return {
      pageId: params.notionTeamMemberPageId,
      templateApplied: false,
      templateMode: "none",
      reusedExisting: true,
      matchedBy: "explicit",
    };
  }

  const teamMemberProperties = buildTeamMemberProperties(params);
  const dataSourceId = await getDatabaseDataSourceId(notionTeamMembersDbId, notionApiKey).catch(() => null);

  let result: CreateTeamMemberPageResult;
  if (dataSourceId) {
    const templateResult = await createPageWithTemplate({
      dataSourceId,
      notionApiKey,
      properties: teamMemberProperties,
      template: getTeamMemberTemplatePreference(),
    });

    if (templateResult) {
      result = templateResult;
    } else {
      result = await createPageWithoutTemplate({
        databaseId: notionTeamMembersDbId,
        notionApiKey,
        properties: teamMemberProperties,
      });
    }
  } else {
    result = await createPageWithoutTemplate({
      databaseId: notionTeamMembersDbId,
      notionApiKey,
      properties: teamMemberProperties,
    });
  }

  await ensureOnboardingPageLinkedToTeamMember({
    teamMemberPageId: result.pageId,
    name: params.name,
    email: params.email,
    notionApiKey,
    notionOnboardingsDbId,
  });
  await ensureMasterClassPagesForTeamMember({
    teamMemberPageId: result.pageId,
    name: params.name,
    email: params.email,
    notionApiKey,
    notionTeamPageIds: params.notionTeamPageIds,
    notionMasterClassesIndexDbId,
  });
  await buildTeamMemberDirectory().catch(() => {});

  return result;
}

export async function updateEntryStatus(notionPageId: string, status: string): Promise<void> {
  if (!process.env.NOTION_API_KEY) return;
  await fetch(`${NOTION_API_BASE}/pages/${notionPageId}`, {
    method: "PATCH",
    headers: notionHeaders(),
    body: JSON.stringify({
      properties: {
        Status: { status: { name: status } },
      },
    }),
  });
}

export async function markEntryDeleted(notionPageId: string): Promise<void> {
  if (!process.env.NOTION_API_KEY) return;
  await fetch(`${NOTION_API_BASE}/pages/${notionPageId}`, {
    method: "PATCH",
    headers: notionHeaders(),
    body: JSON.stringify({
      properties: {
        Status: { status: { name: "Deleted" } },
      },
    }),
  });
}

export async function queryNotionEntriesWindow(
  sinceHours: number
): Promise<Array<{ notionPageId: string; entryId: string | null }>> {
  const dbId = process.env.NOTION_DATABASE_ID;
  if (!dbId || !process.env.NOTION_API_KEY) return [];

  const cutoff = new Date(Date.now() - sinceHours * 60 * 60 * 1000).toISOString();
  const pages: Array<{ notionPageId: string; entryId: string | null }> = [];
  let cursor: string | undefined;

  do {
    const body: Record<string, unknown> = {
      page_size: 100,
      filter: {
        property: "Updated",
        date: {
          on_or_after: cutoff,
        },
      },
    };

    if (cursor) body.start_cursor = cursor;

    const res = await fetch(`${NOTION_API_BASE}/databases/${dbId}/query`, {
      method: "POST",
      headers: notionHeaders(),
      body: JSON.stringify(body),
    });

    if (!res.ok) break;

    const data = (await res.json()) as {
      results: Array<{
        id: string;
        properties?: Record<string, { type: string; rich_text?: { plain_text: string }[]; number?: number | null }>;
      }>;
      has_more?: boolean;
      next_cursor?: string | null;
    };

    for (const page of data.results) {
      const entryIdProp = page.properties?.["Entry ID"];
      const entryId = entryIdProp?.type === "rich_text"
        ? entryIdProp.rich_text?.map((t) => t.plain_text ?? "").join("") || null
        : entryIdProp?.type === "number" && entryIdProp.number != null
          ? String(entryIdProp.number)
          : null;
      pages.push({ notionPageId: page.id, entryId });
    }

    cursor = data.has_more && data.next_cursor ? data.next_cursor : undefined;
  } while (cursor);

  return pages;
}
