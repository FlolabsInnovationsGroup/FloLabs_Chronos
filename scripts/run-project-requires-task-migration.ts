import { neon } from "@neondatabase/serverless";
import fs from "node:fs";
import path from "node:path";

function readDatabaseUrl(): string {
  const envPath = path.resolve(".env.production.local");
  const envRaw = fs.readFileSync(envPath, "utf8");
  const match = envRaw.match(/^DATABASE_URL="?([^"\r\n]+)"?/m);
  if (!match) {
    throw new Error("DATABASE_URL not found in .env.production.local");
  }
  return match[1];
}

async function main() {
  const databaseUrl = readDatabaseUrl();
  const sqlText = fs.readFileSync(path.resolve("scripts/migrate-project-requires-task-on-stop.sql"), "utf8");
  const db = neon(databaseUrl);
  await db.query(sqlText);
  console.log("migration applied");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
