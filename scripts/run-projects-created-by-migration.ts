import fs from "node:fs";
import path from "node:path";
import { createPool, loadEnvFiles } from "./db-utils";

loadEnvFiles([".env.production.local"]);

async function main() {
  const pool = createPool();
  try {
    const sqlText = fs.readFileSync(path.resolve("scripts/migrate-projects-created-by.sql"), "utf8");
    await pool.query(sqlText);
    console.log("projects.created_by_id migration applied");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
