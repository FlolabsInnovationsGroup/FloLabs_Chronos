/**
 * Notion story status reporter.
 * After each spec suite runs, call markStory() to update the corresponding
 * "FloLabs Chronos reports" Notion database entry to "Fixed" (all pass) or
 * "Testing" (one or more failures).
 */

const NOTION_API_KEY =
  process.env.NOTION_API_KEY ?? "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";

/** Maps to the Notion Status property option names */
type StoryStatus = "Fixed" | "Testing" | "In progress" | "Declared";

/**
 * Update a story page's Status field in the Notion QA database.
 * - passed=true  → "Fixed"
 * - passed=false → "Testing"
 */
export async function markStory(pageId: string, passed: boolean): Promise<void> {
  const status: StoryStatus = passed ? "Fixed" : "Testing";
  try {
    const res = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${NOTION_API_KEY}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        properties: {
          Status: { status: { name: status } },
        },
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn(`[notion-reporter] PATCH ${pageId} → ${status} failed (${res.status}): ${body}`);
    }
  } catch (error) {
    console.warn(`[notion-reporter] network error updating ${pageId}:`, error);
  }
}

/** Convenience: update multiple story pages with the same pass/fail result. */
export async function markStories(pageIds: string[], passed: boolean): Promise<void> {
  await Promise.all(pageIds.map((id) => markStory(id, passed)));
}
