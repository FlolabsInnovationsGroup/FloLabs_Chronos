import { NextResponse } from "next/server";
import { buildInfo } from "@/lib/build-info";
import { pool } from "@/lib/db";

export const runtime = "nodejs";

async function checkDatabase(): Promise<boolean> {
  if (!pool) return false;
  try {
    await pool.query("select 1 as ok");
    return true;
  } catch (error) {
    console.error("[api/health] database check failed", error);
    return false;
  }
}

export async function GET() {
  const dbOk = await checkDatabase();
  return NextResponse.json({
    ok: dbOk,
    build: buildInfo(),
    db: dbOk,
  });
}
