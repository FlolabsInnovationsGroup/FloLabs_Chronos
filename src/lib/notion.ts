import type { TimeEntry } from "@/types";

const NOTION_API_BASE = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

function notionHeaders() {
  return {
    Authorization: `Bearer ${process.env.NOTION_API_KEY}`,
    "Content-Type": "application/json",
    "Notion-Version": NOTION_VERSION,
  };
}

/**
 * Creates or updates a Notion page for a time entry.
 * Returns the Notion page ID.
 */
export async function syncEntryToNotion(entry: TimeEntry): Promise<string> {
  const dbId = process.env.NOTION_DATABASE_ID;
  if (!dbId) throw new Error("NOTION_DATABASE_ID is not set");
  if (!process.env.NOTION_API_KEY) throw new Error("NOTION_API_KEY is not set");

  const durationHours = entry.durationMs ? entry.durationMs / 3_600_000 : 0;

  const properties: Record<string, unknown> = {
    Description: {
      title: [
        {
          text: {
            content: entry.description || "Untitled session",
          },
        },
      ],
    },
    Project: {
      rich_text: [
        {
          text: {
            content: entry.project?.name ?? entry.projectId,
          },
        },
      ],
    },
    Duration: {
      number: Math.round(durationHours * 100) / 100,
    },
    Date: {
      date: {
        start: new Date(entry.startedAt).toISOString(),
        end: entry.stoppedAt ? new Date(entry.stoppedAt).toISOString() : undefined,
      },
    },
    User: {
      rich_text: [
        {
          text: {
            content: entry.user?.name ?? entry.userId,
          },
        },
      ],
    },
  };

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
