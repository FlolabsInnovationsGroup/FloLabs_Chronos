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

/** Remove libpq ssl query params so Pool `ssl` options control verification (avoids verify-full from URL). */
function removeSslQueryParams(connectionString: string): string {
  const normalized = connectionString.replace(/^postgres(ql)?:/i, "http:");
  try {
    const u = new URL(normalized);
    u.searchParams.delete("sslmode");
    u.searchParams.delete("ssl");
    const path = `${u.pathname}${u.search}`;
    const auth = u.username
      ? `${encodeURIComponent(u.username)}${u.password ? `:${encodeURIComponent(u.password)}` : ""}@`
      : "";
    const port = u.port ? `:${u.port}` : "";
    const proto = connectionString.startsWith("postgres://") ? "postgres:" : "postgresql:";
    return `${proto}//${auth}${u.hostname}${port}${path}`;
  } catch {
    return connectionString;
  }
}

function tryParsePostgresHost(connectionString: string): string | null {
  try {
    const u = new URL(connectionString.replace(/^postgres(ql)?:/i, "http:"));
    return u.hostname || null;
  } catch {
    return null;
  }
}

/**
 * Pool for one-off migrations against RDS, Neon, tunnels, etc. Uses TLS with
 * `rejectUnauthorized: false` when the target is not a typical local dev DB.
 * Set `sslmode=disable` in the URL for local Postgres without TLS.
 */
export function createMigrationPool(connectionString = getDatabaseUrl()) {
  if (/sslmode=\s*disable/i.test(connectionString)) {
    return new Pool({ connectionString });
  }
  const host = tryParsePostgresHost(connectionString);
  const isLocal = Boolean(host && /^(localhost|127\.0\.0\.1|::1)$/i.test(host));
  const forceRelaxedSsl =
    /rds\.amazonaws\.com|\.neon\.|supabase|pooler\.|cockroachlabs\.cloud/i.test(connectionString) ||
    /sslmode=\s*(require|verify-ca|verify-full|prefer)/i.test(connectionString) ||
    /[?&]ssl=true(?:&|$)/i.test(connectionString);
  if (isLocal && !forceRelaxedSsl) {
    return new Pool({ connectionString });
  }
  const scrubbed = removeSslQueryParams(connectionString);
  return new Pool({
    connectionString: scrubbed,
    ssl: { rejectUnauthorized: false },
  });
}

export function createPool(connectionString = getDatabaseUrl()) {
  const disableRelax = /sslmode=\s*disable/i.test(connectionString);
  const hostLooksManaged =
    /rds\.amazonaws\.com|\.neon\.|supabase|pooler\.|cockroachlabs\.cloud/i.test(connectionString);
  const sslModeNeedsRelax =
    /sslmode=\s*(require|verify-ca|verify-full|prefer)/i.test(connectionString) ||
    /[?&]ssl=true(?:&|$)/i.test(connectionString);
  const envBypass =
    process.env.PGSSL_NO_VERIFY === "1" || process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === "0";
  const shouldRelaxSsl = !disableRelax && (envBypass || hostLooksManaged || sslModeNeedsRelax);
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
