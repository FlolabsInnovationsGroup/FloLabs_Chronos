import { drizzle as drizzleNode } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const connectionString =
  process.env.DATABASE_URL ??
  process.env.FL_CHRONOS_DATABASE_URL ??
  process.env.FL_CHRONOS_DATABASE_URL_UNPOOLED;

let pool: Pool | null = null;

function buildPgConfig(rawConnectionString: string) {
  const needsRelaxedSsl = /sslmode=require/i.test(rawConnectionString);
  if (!needsRelaxedSsl) {
    return { connectionString: rawConnectionString };
  }

  let normalizedConnectionString = rawConnectionString;
  try {
    const parsed = new URL(rawConnectionString);
    parsed.searchParams.delete("sslmode");
    normalizedConnectionString = parsed.toString();
  } catch {
    normalizedConnectionString = rawConnectionString.replace(/([?&])sslmode=require(&?)/i, (_match, prefix: string, suffix: string) => {
      if (prefix === "?" && suffix) return "?";
      if (prefix === "&" && suffix) return "&";
      return "";
    }).replace(/[?&]$/, "");
  }

  return {
    connectionString: normalizedConnectionString,
    ssl: { rejectUnauthorized: false },
  };
}

// Allow app to run without DB for development
function createDb() {
  if (!connectionString) {
    console.warn("DATABASE_URL not set, DB calls will fail at runtime");
    return null as never;
  }

  pool = new Pool({
    ...buildPgConfig(connectionString),
    max: 10,
    idleTimeoutMillis: 20_000,
    connectionTimeoutMillis: 5_000,
  });
  // pg.Pool emits 'error' on idle clients when the backend drops a connection.
  // Without this handler Node.js treats it as an uncaught exception and exits.
  pool.on("error", (err) => {
    console.error("[db] pool idle-client error (connection dropped by server)", err);
  });
  return drizzleNode(pool, { schema });
}

export const db = createDb();
export { pool };
export type DB = typeof db;
