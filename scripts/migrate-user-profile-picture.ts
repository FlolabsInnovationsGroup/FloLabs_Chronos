/**
 * Migration script for users.profile_picture_url.
 * Adds a nullable column used by Chronos settings/avatar UI.
 */

import { createPool, createSqlHelpers, loadEnvFiles } from "./db-utils";

loadEnvFiles([".env.local"]);

async function main() {
  const pool = createPool();
  const sql = createSqlHelpers(pool);

  try {
    console.log("Running users.profile_picture_url migration...");

    await sql.exec(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS profile_picture_url TEXT
    `);

    console.log("users.profile_picture_url migration complete!");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
