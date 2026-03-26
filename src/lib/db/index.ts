import { drizzle } from "drizzle-orm/neon-serverless";
import { neon } from "@neondatabase/serverless";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

// Allow app to run without DB for development
function createDb() {
  if (!connectionString) {
    console.warn("DATABASE_URL not set — DB calls will fail at runtime");
    return null as never;
  }
  const sql = neon(connectionString);
  return drizzle(sql, { schema });
}

export const db = createDb();
export type DB = typeof db;
