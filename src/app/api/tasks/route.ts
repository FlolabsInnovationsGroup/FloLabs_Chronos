import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { searchTasks } from "@/lib/notion";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ tasks: [] }, { status: 401 });
  const q = new URL(req.url).searchParams.get("q") ?? "";
  const tasks = await searchTasks(q);
  return NextResponse.json({ tasks });
}
