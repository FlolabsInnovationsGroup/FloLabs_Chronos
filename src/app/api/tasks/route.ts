import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getNotionConfig } from "@/lib/app-config";
import { searchTasks } from "@/lib/notion";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ tasks: [] }, { status: 401 });

  const q = new URL(req.url).searchParams.get("q") ?? "";

  try {
    const config = await getNotionConfig();
    const tasks = await searchTasks(q);
    const taskSearchConfigured = Boolean(config.notionApiKey && config.notionTasksDbId);
    return NextResponse.json({
      tasks,
      meta: {
        query: q,
        taskSearchConfigured,
      },
    });
  } catch (error) {
    const config = await getNotionConfig().catch(() => null);
    return NextResponse.json(
      {
        tasks: [],
        meta: {
          query: q,
          taskSearchConfigured: Boolean(config?.notionApiKey && config?.notionTasksDbId),
        },
        error: error instanceof Error ? error.message : "Task search failed",
      },
      { status: 500 }
    );
  }
}
