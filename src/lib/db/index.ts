import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzleNode } from "drizzle-orm/node-postgres";
import { neon } from "@neondatabase/serverless";
import { Pool } from "pg";
import * as schema from "./schema";

const connectionString =
  process.env.DATABASE_URL ??
  process.env.FL_CHRONOS_DATABASE_URL ??
  process.env.FL_CHRONOS_DATABASE_URL_UNPOOLED;

let pool: Pool | null = null;

// Allow app to run without DB for development
function createDb() {
  if (!connectionString) {
    console.warn("DATABASE_URL not set, DB calls will fail at runtime");
    return null as never;
  }

  const isNeon = /neon\.tech/i.test(connectionString);

  if (isNeon) {
    const sql = neon(connectionString);
    return drizzleNeon(sql, { schema });
  }

  pool = new Pool({ connectionString });
  return drizzleNode(pool, { schema });
}

export const db = createDb();
export { pool };
export type DB = typeof db;
