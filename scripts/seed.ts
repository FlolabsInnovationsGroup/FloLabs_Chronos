/**
 * Seed script - creates a default admin user.
 * Usage: npx tsx scripts/seed.ts
 * Requires DATABASE_URL in environment or .env.local
 */

import { readFileSync } from "fs";
import { resolve } from "path";

// Simple .env.local loader
try {
  const envPath = resolve(process.cwd(), ".env.local");
  const content = readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim().replace(/^"|"$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
} catch { /* .env.local not found */ }

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { teams, users, projects, tags } from "../src/lib/db/schema";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { createTeamSlug } from "../src/lib/invitations";

async function main() {
  const url =
    process.env.DATABASE_URL ??
    process.env.FL_CHRONOS_DATABASE_URL ??
    process.env.FL_CHRONOS_DATABASE_URL_UNPOOLED;
  if (!url) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }
  const sql = neon(url);
  const db = drizzle(sql);
  console.log("Seeding database...");

  const adminEmail = "pm@flolabsinnovations.com";
  const legacyAdminEmail = "admin@flolabsinnovations.com";
  const defaultTeamName = "FloLabs Core";
  const defaultTeamSlug = createTeamSlug(defaultTeamName);

  let teamId: string | null = null;
  const existingTeam = await db
    .select({ id: teams.id })
    .from(teams)
    .where(eq(teams.slug, defaultTeamSlug))
    .limit(1);

  if (existingTeam.length > 0) {
    teamId = existingTeam[0].id;
  } else {
    const [team] = await db
      .insert(teams)
      .values({ name: defaultTeamName, slug: defaultTeamSlug })
      .returning({ id: teams.id });
    teamId = team.id;
    console.log("Created team:", defaultTeamName);
  }

  const existing = await db
    .select({ id: users.id, email: users.email, teamId: users.teamId, isActive: users.isActive })
    .from(users)
    .where(eq(users.email, adminEmail))
    .limit(1);

  const legacyExisting = await db
    .select({ id: users.id, email: users.email, teamId: users.teamId, isActive: users.isActive })
    .from(users)
    .where(eq(users.email, legacyAdminEmail))
    .limit(1);

  // Also check the original legacy email
  const olderLegacy = await db
    .select({ id: users.id, email: users.email, teamId: users.teamId, isActive: users.isActive })
    .from(users)
    .where(eq(users.email, "admin@flolabs.io"))
    .limit(1);

  if (existing.length > 0) {
    console.log("Admin already exists");
    if (!existing[0].teamId || existing[0].isActive === false) {
      await db
        .update(users)
        .set({ teamId, isActive: true, updatedAt: new Date() })
        .where(eq(users.id, existing[0].id));
      console.log("Updated existing admin team assignment");
    }
  } else if (legacyExisting.length > 0) {
    await db
      .update(users)
      .set({
        email: adminEmail,
        teamId,
        isActive: true,
        updatedAt: new Date(),
      })
      .where(eq(users.id, legacyExisting[0].id));
    console.log(`Migrated admin email: ${legacyAdminEmail} -> ${adminEmail}`);
  } else if (olderLegacy.length > 0) {
    await db
      .update(users)
      .set({
        email: adminEmail,
        teamId,
        isActive: true,
        updatedAt: new Date(),
      })
      .where(eq(users.id, olderLegacy[0].id));
    console.log(`Migrated admin email: admin@flolabs.io -> ${adminEmail}`);
  } else {
    const hash = await bcrypt.hash("flchron2026", 12);
    await db.insert(users).values({
      name: "Admin",
      email: adminEmail,
      password: hash,
      role: "admin",
      teamId,
      isActive: true,
    });
    console.log(`Created admin: ${adminEmail} / flchron2026`);
  }

  const sampleProjects = [
    { name: "Brand Guidelines", color: "#366769", icon: "palette" },
    { name: "Website Redesign", color: "#5c5e6e", icon: "web" },
    { name: "Mobile App", color: "#755a40", icon: "phone_android" },
  ];
  for (const p of sampleProjects) {
    const exists = await db.select({ id: projects.id }).from(projects).where(eq(projects.name, p.name)).limit(1);
    if (exists.length === 0) { await db.insert(projects).values(p); console.log("Created project:", p.name); }
  }

  const sampleTags = [
    { name: "Design", color: "#366769" },
    { name: "Development", color: "#5c5e6e" },
    { name: "Research", color: "#755a40" },
  ];
  for (const t of sampleTags) {
    const exists = await db.select({ id: tags.id }).from(tags).where(eq(tags.name, t.name)).limit(1);
    if (exists.length === 0) { await db.insert(tags).values(t); console.log("Created tag:", t.name); }
  }

  console.log("Seed complete!");
}

main().catch((err) => { console.error("Seed failed:", err); process.exit(1); });
