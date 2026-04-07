import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { neon } from "@neondatabase/serverless";

function loadEnvFile(fileName: string) {
  try {
    const envPath = resolve(process.cwd(), fileName);
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
    /* missing file */
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env.production.local");

function getDatabaseUrl(): string {
  const url =
    process.env.DATABASE_URL ??
    process.env.FL_CHRONOS_DATABASE_URL ??
    process.env.FL_CHRONOS_DATABASE_URL_UNPOOLED;
  if (!url) {
    throw new Error(
      "DATABASE_URL not set. Add it to .env.local or export it, then run: pnpm exec tsx scripts/run-backfill-projects-created-by-admin.ts"
    );
  }
  return url;
}

async function main() {
  const databaseUrl = getDatabaseUrl();
  const db = neon(databaseUrl);

  const addColumnSql = readFileSync(resolve("scripts/migrate-projects-created-by.sql"), "utf8");
  await db.query(addColumnSql);
  console.log("schema: projects.created_by_id ensured");

  const backfillSql = readFileSync(resolve("scripts/backfill-projects-created-by-admin.sql"), "utf8");
  await db.query(backfillSql);
  console.log("backfill: projects.created_by_id set for legacy rows (primary admin)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
