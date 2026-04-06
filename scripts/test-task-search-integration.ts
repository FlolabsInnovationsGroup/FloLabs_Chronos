/**
 * Integration check for Notion task search (no HTTP, no auth).
 * Loads .env.local like seed.ts, then calls searchTasks().
 *
 * Usage: pnpm exec tsx scripts/test-task-search-integration.ts [query]
 */

import { readFileSync } from "fs";
import { resolve } from "path";

try {
  const envPath = resolve(process.cwd(), ".env.local");
  const content = readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim().replace(/^"|"$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
} catch {
  /* .env.local missing */
}

async function main() {
  const q = process.argv[2] ?? "a";
  const { getNotionConfig } = await import("../src/lib/app-config");
  const { searchTasks } = await import("../src/lib/notion");
  const config = await getNotionConfig().catch(() => null);
  const hasKey = Boolean(config?.notionApiKey ?? process.env.NOTION_API_KEY);
  const tasks = await searchTasks(q);
  console.log(
    JSON.stringify(
      {
        query: q,
        hasNotionApiKey: hasKey,
        notionTasksDbIdSet: Boolean(config?.notionTasksDbId),
        envNotionDatabaseId: Boolean(process.env.NOTION_DATABASE_ID),
        count: tasks.length,
        sample: tasks.slice(0, 5),
      },
      null,
      2
    )
  );
  if (!hasKey) {
    console.warn("No Notion API key in app config / env — task search will always return [].");
  } else if (tasks.length === 0) {
    console.warn(
      "No tasks for this query. If the UI also shows empty results, verify Tasks DB id and integration access."
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
