import fs from "node:fs";
import path from "node:path";
import { createPool, loadEnvFiles } from "./db-utils";

loadEnvFiles([".env.production.local"]);

async function main() {
  const pool = createPool();
  try {
    const sqlText = fs.readFileSync(path.resolve("scripts/migrate-project-requires-task-on-stop.sql"), "utf8");
    await pool.query(sqlText);
    console.log("migration applied");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
