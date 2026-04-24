import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getNotionConfig } from "@/lib/app-config";
import { resolveNotionDatabaseIdsFromRelations, searchTasks } from "@/lib/notion";

function taskSearchHint(config: Awaited<ReturnType<typeof getNotionConfig>>, resolvedTasksDbId: string | null): string | undefined {
  if (!config.notionApiKey) return "Notion API key is not configured (Control page or deployment env).";
  if (!config.notionDatabaseId && !config.notionTasksDbId)
    return "Set the Time Entries database ID on Control (or NOTION_DATABASE_ID / NOTION_TASKS_DB_ID in deployment).";
  if (!resolvedTasksDbId)
    return "Tasks database could not be resolved from the Time Entries schema (check the Task relation on that database and integration access).";
  return undefined;
}

async function resolveTasksDbIdForApi(config: Awaited<ReturnType<typeof getNotionConfig>>): Promise<string | null> {
  if (config.notionTasksDbId) return config.notionTasksDbId;
  if (!config.notionDatabaseId || !config.notionApiKey) return null;
  try {
    const d = await resolveNotionDatabaseIdsFromRelations(config.notionApiKey, config.notionDatabaseId);
    return d.tasksDbId;
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ tasks: [] }, { status: 401 });

  const q = new URL(req.url).searchParams.get("q") ?? "";

  try {
    const config = await getNotionConfig();
    const resolvedTasksDbId = await resolveTasksDbIdForApi(config);
    const taskSearchConfigured = Boolean(config.notionApiKey && resolvedTasksDbId);
    const tasks = await searchTasks(q);
    return NextResponse.json({
      tasks,
      meta: {
        query: q,
        taskSearchConfigured,
        tasksDatabaseResolved: Boolean(resolvedTasksDbId),
        hint: taskSearchHint(config, resolvedTasksDbId),
      },
    });
  } catch (error) {
    const config = await getNotionConfig().catch(() => null);
    const resolvedTasksDbId = config ? await resolveTasksDbIdForApi(config) : null;
    return NextResponse.json(
      {
        tasks: [],
        meta: {
          query: q,
          taskSearchConfigured: Boolean(config?.notionApiKey && resolvedTasksDbId),
          tasksDatabaseResolved: Boolean(resolvedTasksDbId),
          hint: config ? taskSearchHint(config, resolvedTasksDbId) : undefined,
        },
        error: error instanceof Error ? error.message : "Task search failed",
      },
      { status: 500 }
    );
  }
}
