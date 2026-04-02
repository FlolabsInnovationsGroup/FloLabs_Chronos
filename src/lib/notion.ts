import type { TimeEntry } from "@/types";

const NOTION_API_BASE = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

interface NotionDatabaseProperty {
  type: string;
}

interface NotionDatabaseResponse {
  properties: Record<string, NotionDatabaseProperty>;
}

let databaseSchemaPromise: Promise<NotionDatabaseResponse> | null = null;

function notionHeaders() {
  return {
    Authorization: `Bearer ${process.env.NOTION_API_KEY}`,
    "Content-Type": "application/json",
    "Notion-Version": NOTION_VERSION,
  };
}

async function getDatabaseSchema(databaseId: string) {
  if (!databaseSchemaPromise) {
    databaseSchemaPromise = fetch(`${NOTION_API_BASE}/databases/${databaseId}`, {
      headers: notionHeaders(),
    }).then(async (res) => {
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Notion schema lookup failed: ${err}`);
      }

      return (await res.json()) as NotionDatabaseResponse;
    });
  }

  return databaseSchemaPromise;
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
      entry.project?.name ?? entry.projectId
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

  // If we already have a page ID, update it; otherwise create
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

  // Create new page
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

/** Normalize a display name for fuzzy matching */
function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
}

/** Tokenize a normalized name */
function tokenize(name: string): Set<string> {
  return new Set(name.split(/\s+/).filter(Boolean));
}

/** Jaccard similarity between two token sets */
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  const intersection = [...a].filter((x) => b.has(x)).length;
  const union = new Set([...a, ...b]).size;
  return intersection / union;
}

/** Redis key for the team member name index */
const TEAM_INDEX_KEY = "notion:team-index";
const TEAM_INDEX_TTL = 7200; // seconds

/** Lazy-load a simple Redis get/set for caching the team index. */
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

/**
 * Build fuzzy name index: normalized_name -> Notion page ID
 * Queries Onboardings DB, paginates all results, caches in Redis.
 */
export async function buildTeamMemberIndex(): Promise<Map<string, string>> {
  const dbId = process.env.NOTION_ONBOARDINGS_DB_ID;
  if (!dbId) return new Map();

  const index = new Map<string, string>();
  let cursor: string | undefined;

  do {
    const body: Record<string, unknown> = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;

    const res = await fetch(`${NOTION_API_BASE}/databases/${dbId}/query`, {
      method: "POST",
      headers: notionHeaders(),
      body: JSON.stringify(body),
    });

    if (!res.ok) break;

    const data = (await res.json()) as {
      results: { id: string; properties: Record<string, { type: string; title?: { plain_text: string }[] }> }[];
      has_more: boolean;
      next_cursor: string | null;
    };

    for (const page of data.results) {
      // Find the title property value (Name / Full Name / etc.)
      for (const prop of Object.values(page.properties)) {
        if (prop.type === "title" && prop.title?.length) {
          const rawName = prop.title.map((t) => t.plain_text).join("");
          if (rawName) {
            index.set(normalizeName(rawName), page.id);
          }
          break;
        }
      }
    }

    cursor = data.has_more && data.next_cursor ? data.next_cursor : undefined;
  } while (cursor);

  // Persist to cache
  const serialized = JSON.stringify([...index.entries()]);
  await cacheSet(TEAM_INDEX_KEY, serialized, TEAM_INDEX_TTL);

  return index;
}

/**
 * Resolve Onboardings page ID for a user display name using fuzzy token-Jaccard matching.
 * Uses Redis cache; rebuilds if missing.
 */
export async function resolveTeamMemberPageId(userName: string): Promise<string | null> {
  // Try cache first
  let index: Map<string, string> | null = null;
  const cached = await cacheGet(TEAM_INDEX_KEY);
  if (cached) {
    try {
      index = new Map(JSON.parse(cached) as [string, string][]);
    } catch {
      index = null;
    }
  }

  if (!index || index.size === 0) {
    index = await buildTeamMemberIndex();
  }

  if (index.size === 0) return null;

  const queryTokens = tokenize(normalizeName(userName));
  let bestId: string | null = null;
  let bestScore = 0;

  for (const [indexedName, pageId] of index.entries()) {
    const score = jaccard(queryTokens, tokenize(indexedName));
    if (score > bestScore) {
      bestScore = score;
      bestId = pageId;
    }
  }

  // Require at least a modest overlap
  return bestScore >= 0.4 ? bestId : null;
}

/**
 * Build the full Notion property payload for a time entry.
 */
export function buildNotionEntryProperties(
  entry: FullEntry,
  teamMemberPageId: string | null,
  status: string
): Record<string, unknown> {
  const durationSecs = entry.durationMs ? Math.round(entry.durationMs / 1000) : 0;
  const tagNames = (entry.tags ?? []).map((t) => t.name);
  const userKey = entry.user?.name
    ? `${entry.user.name} — ${new Date(entry.startedAt).toISOString().split("T")[0]}`
    : entry.id;

  const properties: Record<string, unknown> = {
    "User Key": buildTitleValue(userKey),
    "Entry ID": buildRichTextValue(entry.id),
    "Project": { select: { name: entry.project?.name ?? "Unknown" } },
    "Tags": { multi_select: tagNames.map((n) => ({ name: n })) },
    "Date": {
      date: {
        start: new Date(entry.startedAt).toISOString(),
        end: entry.stoppedAt ? new Date(entry.stoppedAt).toISOString() : undefined,
      },
    },
    "Updated": {
      date: { start: new Date(entry.updatedAt ?? entry.startedAt).toISOString() },
    },
    "Duration": { number: durationSecs },
    "Description": buildRichTextValue(entry.description || ""),
    "Status": { status: { name: status } },
  };

  if (teamMemberPageId) {
    properties["Team Member"] = { relation: [{ id: teamMemberPageId }] };
  }

  return properties;
}

/**
 * Full upsert: create if no notionPageId, update if notionPageId exists.
 * Returns the Notion page ID, or null on failure.
 */
export async function syncEntryToNotionFull(entry: FullEntry): Promise<string | null> {
  const dbId = process.env.NOTION_DATABASE_ID;
  if (!dbId || !process.env.NOTION_API_KEY) return null;

  const isNew = !entry.notionPageId;
  const status = isNew ? "Processed" : "Edited";

  // Prefer the stored notionTeamMemberId on the user record (populated by teams-sync)
  // before falling back to the slower fuzzy-match index lookup
  let teamMemberPageId: string | null = null;
  const storedId = (entry.user as { notionTeamMemberId?: string | null } | undefined)?.notionTeamMemberId ?? null;
  if (storedId) {
    teamMemberPageId = storedId;
  } else if (entry.user?.name) {
    teamMemberPageId = await resolveTeamMemberPageId(entry.user.name).catch(() => null);
  }

  const properties = buildNotionEntryProperties(entry, teamMemberPageId, status);

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

  // Create
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

export async function updateEntryStatus(notionPageId: string, status: string): Promise<void> {
  if (!process.env.NOTION_API_KEY) return;
  await fetch(`${NOTION_API_BASE}/pages/${notionPageId}`, {
    method: "PATCH",
    headers: notionHeaders(),
    body: JSON.stringify({
      properties: {
        "Status": { status: { name: status } },
      },
    }),
  });
}

/**
 * Mark a Notion page status as 'Deleted'.
 */
export async function markEntryDeleted(notionPageId: string): Promise<void> {
  await updateEntryStatus(notionPageId, "Deleted");
}

/**
 * Query Notion Time Entries DB for pages in a date window.
 * Returns [{ notionPageId, entryId }] for all pages found.
 */
export async function queryNotionEntriesWindow(daysBack: number): Promise<{ notionPageId: string; entryId: string | null }[]> {
  const dbId = process.env.NOTION_DATABASE_ID;
  if (!dbId || !process.env.NOTION_API_KEY) return [];

  const since = new Date();
  since.setDate(since.getDate() - daysBack);

  const results: { notionPageId: string; entryId: string | null }[] = [];
  let cursor: string | undefined;

  do {
    const body: Record<string, unknown> = {
      page_size: 100,
      filter: {
        and: [
          {
            property: "Date",
            date: { on_or_after: since.toISOString().split("T")[0] },
          },
          {
            property: "Status",
            status: { does_not_equal: "Notified" },
          },
        ],
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
      results: {
        id: string;
        properties: Record<string, {
          type: string;
          rich_text?: { plain_text: string }[];
          status?: { name: string };
        }>;
      }[];
      has_more: boolean;
      next_cursor: string | null;
    };

    for (const page of data.results) {
      const entryIdProp = page.properties["Entry ID"];
      const entryId = entryIdProp?.type === "rich_text" && entryIdProp.rich_text?.length
        ? entryIdProp.rich_text.map((t) => t.plain_text).join("")
        : null;
      results.push({ notionPageId: page.id, entryId });
    }

    cursor = data.has_more && data.next_cursor ? data.next_cursor : undefined;
  } while (cursor);

  return results;
}
