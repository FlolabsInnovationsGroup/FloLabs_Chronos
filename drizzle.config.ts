import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "drizzle-kit";

for (const file of [".env.local", ".env.production.local"]) {
  const envPath = resolve(process.cwd(), file);
  if (!existsSync(envPath)) continue;

  const content = readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim().replace(/^"|"$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

const databaseUrl =
  process.env.DATABASE_URL ??
  process.env.FL_CHRONOS_DATABASE_URL ??
  process.env.FL_CHRONOS_DATABASE_URL_UNPOOLED;

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./src/lib/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl!,
  },
});
