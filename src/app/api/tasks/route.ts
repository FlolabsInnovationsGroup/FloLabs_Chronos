import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { searchTasks } from "@/lib/notion";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ tasks: [] }, { status: 401 });

  const q = new URL(req.url).searchParams.get("q") ?? "";

  try {
    const tasks = await searchTasks(q);
    return NextResponse.json({
      tasks,
      meta: {
        query: q,
        taskSearchConfigured: Boolean(process.env.NOTION_TASKS_DB_ID && process.env.NOTION_API_KEY),
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        tasks: [],
        meta: {
          query: q,
          taskSearchConfigured: Boolean(process.env.NOTION_TASKS_DB_ID && process.env.NOTION_API_KEY),
        },
        error: error instanceof Error ? error.message : "Task search failed",
      },
      { status: 500 }
    );
  }
}
