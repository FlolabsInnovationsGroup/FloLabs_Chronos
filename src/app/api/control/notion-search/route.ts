import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { getNotionConfig } from "@/lib/app-config";

const NOTION_API_BASE = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { notionApiKey } = await getNotionConfig();
  if (!notionApiKey) {
    return NextResponse.json({ databases: [], error: "Notion API key not configured." }, { status: 400 });
  }

  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().toLowerCase();
  const res = await fetch(`${NOTION_API_BASE}/search`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${notionApiKey}`,
      "Content-Type": "application/json",
      "Notion-Version": NOTION_VERSION,
    },
    body: JSON.stringify({
      filter: { property: "object", value: "database" },
      page_size: 20,
      query: q || undefined,
      sort: { direction: "descending", timestamp: "last_edited_time" },
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return NextResponse.json({ databases: [], error: data.message ?? "Notion search failed" }, { status: res.status });
  }

  const databases = (data.results ?? []).map((db: any) => {
    const title = (db.title ?? []).map((t: any) => t.plain_text ?? "").join("").trim() || "Untitled database";
    return { id: db.id, title, url: db.url ?? null };
  });

  return NextResponse.json({ databases });
}
