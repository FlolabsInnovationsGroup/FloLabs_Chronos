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
  if (tagProperty && entry.tag?.name) {
    properties[tagProperty] = buildSelectLikeValue(dbProperties[tagProperty].type, entry.tag.name);
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
