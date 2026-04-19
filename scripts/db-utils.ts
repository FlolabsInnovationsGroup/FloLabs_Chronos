import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type QueryResultRow } from "pg";

export function loadEnvFiles(files = [".env.local", ".env.production.local"]) {
  for (const file of files) {
    try {
      const content = readFileSync(resolve(process.cwd(), file), "utf-8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx === -1) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
        if (!process.env[key]) process.env[key] = value;
      }
    } catch {
      // optional env file
    }
  }
}

export function getDatabaseUrl() {
  const url =
    process.env.DATABASE_URL ??
    process.env.FL_CHRONOS_DATABASE_URL ??
    process.env.FL_CHRONOS_DATABASE_URL_UNPOOLED;

  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }

  return url;
}

export function createPool(connectionString = getDatabaseUrl()) {
  const needsRelaxedSsl = /sslmode=require/i.test(connectionString);
  const shouldRelaxSsl = needsRelaxedSsl || /rds\.amazonaws\.com/i.test(connectionString);
  return new Pool({
    connectionString,
    ...(shouldRelaxSsl ? { ssl: { rejectUnauthorized: false } } : {}),
  });
}

export function createSqlHelpers(pool: Pool) {
  return {
    async query<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []) {
      const result = await pool.query<T>(text, params);
      return result.rows;
    },
    async exec(text: string, params: unknown[] = []) {
      await pool.query(text, params);
    },
  };
}

export function createDrizzle(pool: Pool) {
  return drizzle(pool);
}
