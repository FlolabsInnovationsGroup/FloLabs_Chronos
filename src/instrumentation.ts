export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  try {
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    const { db, pool } = await import("@/lib/db");
    if (!db || !pool) {
      console.warn("[instrumentation] DB not available, skipping migrations");
      return;
    }
    await migrate(db, { migrationsFolder: "./src/lib/db/migrations" });
    console.log("[instrumentation] DB migrations applied");
  } catch (err) {
    console.error("[instrumentation] Migration failed:", err);
  }
}
