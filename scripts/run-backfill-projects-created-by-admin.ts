import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createPool, loadEnvFiles } from "./db-utils";

loadEnvFiles([".env.local", ".env.production.local"]);

async function main() {
  const pool = createPool();

  try {
    const addColumnSql = readFileSync(resolve("scripts/migrate-projects-created-by.sql"), "utf8");
    await pool.query(addColumnSql);
    console.log("schema: projects.created_by_id ensured");

    const backfillSql = readFileSync(resolve("scripts/backfill-projects-created-by-admin.sql"), "utf8");
    await pool.query(backfillSql);
    console.log("backfill: projects.created_by_id set for legacy rows (primary admin)");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
