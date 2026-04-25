import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { createDrizzle, createPool, loadEnvFiles } from "./db-utils";
import { projects, tags, teams, timeEntries, timeEntryTags, users } from "../src/lib/db/schema";
import type { NewTimeEntry } from "../src/lib/db/schema";

loadEnvFiles([".env.local", ".env.production.local"]);

type CsvRow = Record<string, string>;
type UserRow = { id: string; name: string; email: string; notionTeamMemberId: string | null; teamId: string | null };
type TeamRow = { id: string; name: string; slug: string };
type ProjectRow = { id: string; name: string };

const args = process.argv.slice(2);
const csvArg = args.find((arg) => arg.startsWith("--csv="));
const dryRun = args.includes("--dry-run");
const resetState = args.includes("--reset-state");
const batchSizeArg = args.find((arg) => arg.startsWith("--batch-size="));
const batchSize = batchSizeArg ? Number(batchSizeArg.slice("--batch-size=".length)) : 250;
const statePathArg = args.find((arg) => arg.startsWith("--state="));
const statePath = statePathArg
  ? path.resolve(statePathArg.slice("--state=".length))
  : path.resolve(__dirname, "notion-import-progress.json");
const csvPath = csvArg
  ? path.resolve(csvArg.slice("--csv=".length))
  : path.resolve(
      __dirname,
      "..",
      "..",
      "FloLabs_Hermes",
      "old_workflow_assets",
      "Time_Entries_2026-04-20",
      "Time Entries 297a157695518075ab6cea94e60e4220_all.csv",
    );

if (!fs.existsSync(csvPath)) throw new Error(`CSV file not found: ${csvPath}`);
if (!Number.isFinite(batchSize) || batchSize <= 0) throw new Error(`Invalid batch size: ${batchSize}`);

function parseCsv(text: string): CsvRow[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(current.replace(/\r$/, ""));
      current = "";
    } else if (ch === "\n") {
      row.push(current.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      current = "";
    } else {
      current += ch;
    }
  }

  if (current.length > 0 || row.length > 0) {
    row.push(current.replace(/\r$/, ""));
    rows.push(row);
  }

  const [header, ...data] = rows;
  if (!header) return [];

  return data
    .filter((r) => r.some((cell) => cell.trim().length > 0))
    .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}

function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[^\x00-\x7F]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "team";
}

function extractNotionPageId(value: string): string | null {
  const match = value.match(/-([0-9a-f]{32})(?:\?|\)|$)/i) || value.match(/([0-9a-f]{32})(?:\?|\)|$)/i);
  return match ? match[1].toLowerCase() : null;
}

function parseDateRange(range: string): { startedAt: Date | null; stoppedAt: Date | null } {
  if (!range.trim()) return { startedAt: null, stoppedAt: null };
  const parts = range.split("→").map((part) => part.trim());
  if (parts.length !== 2) return { startedAt: null, stoppedAt: null };

  const startText = parts[0];
  const endPart = parts[1];
  const startMatch = startText.match(/^(.+?)\s+\((GMT[+-]\d+)\)$/i);
  if (!startMatch) return { startedAt: null, stoppedAt: null };

  const startBase = startMatch[1].trim();
  const offset = startMatch[2].toUpperCase().replace("GMT", "");
  const startDate = new Date(`${startBase} ${offset}`);
  if (Number.isNaN(startDate.getTime())) return { startedAt: null, stoppedAt: null };

  let endDate = new Date(`${endPart} ${offset}`);
  if (Number.isNaN(endDate.getTime())) {
    const monthDayYear = startBase.match(/^([A-Za-z]+ \d{1,2}, \d{4})\s+/)?.[1];
    if (!monthDayYear) return { startedAt: null, stoppedAt: null };
    endDate = new Date(`${monthDayYear} ${endPart} ${offset}`);
  }
  if (Number.isNaN(endDate.getTime())) return { startedAt: null, stoppedAt: null };
  if (endDate.getTime() < startDate.getTime()) endDate = new Date(endDate.getTime() + 24 * 60 * 60 * 1000);

  return { startedAt: startDate, stoppedAt: endDate };
}

function makeImportedEmail(name: string, notionId: string): string {
  const local = slugify(name || notionId || crypto.randomUUID());
  return `${local || "imported"}@imported.local`;
}

function loadState() {
  if (resetState || !fs.existsSync(statePath)) return { completedNotionPageIds: [] as string[] };
  return JSON.parse(fs.readFileSync(statePath, "utf8")) as { completedNotionPageIds: string[] };
}

function saveState(completedNotionPageIds: Set<string>) {
  fs.writeFileSync(
    statePath,
    JSON.stringify(
      {
        updatedAt: new Date().toISOString(),
        completedNotionPageIds: Array.from(completedNotionPageIds).sort(),
      },
      null,
      2,
    ),
  );
}

async function main() {
  const rows = parseCsv(fs.readFileSync(csvPath, "utf8"));
  const state = loadState();
  const completedFromState = new Set((state.completedNotionPageIds ?? []).map((id) => id.toLowerCase()));

  console.log(`Loaded ${rows.length} CSV rows from ${csvPath}`);
  console.log(`Mode: ${dryRun ? "dry-run" : "live import"}`);
  console.log(`State file: ${statePath}`);
  console.log(`Batch size: ${batchSize}`);

  const pool = createPool();
  const db = createDrizzle(pool);

  try {
    const [existingUsers, existingProjects, existingTeams, existingEntries] = await Promise.all([
      db.select({ id: users.id, name: users.name, email: users.email, notionTeamMemberId: users.notionTeamMemberId, teamId: users.teamId }).from(users),
      db.select({ id: projects.id, name: projects.name }).from(projects),
      db.select({ id: teams.id, name: teams.name, slug: teams.slug }).from(teams),
      db.select({ notionPageId: timeEntries.notionPageId }).from(timeEntries),
    ]);

    const projectByName = new Map(existingProjects.map((p) => [p.name.toLowerCase(), p]));
    const teamByName = new Map(existingTeams.map((t) => [t.name.toLowerCase(), t]));
    const userByNotionId = new Map(existingUsers.filter((u) => u.notionTeamMemberId).map((u) => [u.notionTeamMemberId!.toLowerCase(), u]));
    const userByName = new Map(existingUsers.map((u) => [u.name.trim().toLowerCase(), u]));
    const existingNotionPageIds = new Set(existingEntries.flatMap((entry) => (entry.notionPageId ? [entry.notionPageId.toLowerCase()] : [])));
    const completedIds = new Set<string>([...completedFromState, ...existingNotionPageIds]);

    const adminUser = existingUsers.find((u) => u.email.toLowerCase() === "pm@flolabsinnovations.com");
    if (!adminUser) throw new Error("Admin user pm@flolabsinnovations.com not found in Chronos AWS DB");
    const adminCreatedById = adminUser.id;

    const prepared = rows.flatMap((row) => {
      const notionPageId = row["Entry ID"]?.trim();
      if (!notionPageId) return [];
      if (completedIds.has(notionPageId.toLowerCase())) return [];

      const userKey = row["User Key"]?.trim();
      const teamMemberCell = row["Team Member"]?.trim() ?? "";
      const teamMemberName = teamMemberCell.replace(/\s*\(https?:\/\/[^)]*\)\s*$/, "").trim();
      const teamMemberNotionId = extractNotionPageId(teamMemberCell);
      const projectName = row["Project"]?.trim() || "Imported";
      const description = row["Description"]?.trim() || "Imported entry";
      const durationSeconds = Number(row["Duration"] || "0");
      const { startedAt, stoppedAt } = parseDateRange(row["Date"] || "");
      if (!startedAt || !stoppedAt || !Number.isFinite(durationSeconds) || durationSeconds <= 0) return [];

      return [{
        row,
        notionPageId,
        userKey,
        teamMemberName,
        teamMemberNotionId,
        projectName,
        description,
        durationMs: Math.round(durationSeconds * 1000),
        startedAt,
        stoppedAt,
        taskPageId: extractNotionPageId(row["Task"] || "") ?? undefined,
        taskTitle: row["Task"]?.replace(/\s*\(https?:\/\/[^)]*\)\s*$/, "").trim() || undefined,
        tagNames: (row["Tags"] || "").split(",").map((tag) => tag.trim()).filter(Boolean),
      }];
    });

    console.log(`Prepared ${prepared.length} entries to import after filtering completed rows`);

    let insertedUsers = 0;
    let insertedTeams = 0;
    let insertedProjects = 0;
    let insertedEntries = 0;
    let insertedTags = 0;

    async function ensureUser(teamMemberNotionId: string | null, teamMemberName: string, userKey: string | undefined, notionPageId: string): Promise<UserRow> {
      const existing = (teamMemberNotionId ? userByNotionId.get(teamMemberNotionId.toLowerCase()) : undefined)
        ?? (teamMemberName ? userByName.get(teamMemberName.toLowerCase()) : undefined)
        ?? (userKey ? userByName.get(userKey.toLowerCase()) : undefined);
      if (existing) return existing as UserRow;

      const baseName = teamMemberName || userKey || `Imported User ${notionPageId}`;
      const teamName = "Imported Team";
      let team = teamByName.get(teamName.toLowerCase()) as TeamRow | undefined;
      if (!team) {
        if (!dryRun) {
          const [createdTeam] = await db.insert(teams).values({ name: teamName, slug: slugify(teamName) }).onConflictDoNothing().returning();
          const matchingTeams = await db.select({ id: teams.id, name: teams.name, slug: teams.slug }).from(teams).where(eq(teams.slug, slugify(teamName)));
          team = (createdTeam ?? matchingTeams[0]) as TeamRow | undefined;
        } else {
          team = { id: "dry-run-team", name: teamName, slug: slugify(teamName) };
        }
        if (!team) throw new Error("Failed to create or load Imported Team");
        teamByName.set(teamName.toLowerCase(), team);
        insertedTeams++;
      }

      let user: UserRow | undefined;
      if (!dryRun) {
        const [createdUser] = await db.insert(users).values({
          name: baseName,
          email: makeImportedEmail(baseName, notionPageId),
          password: "imported-not-login-enabled",
          role: "member",
          teamId: team.id,
          isActive: true,
          notionTeamMemberId: teamMemberNotionId ?? undefined,
        }).onConflictDoNothing().returning({ id: users.id, name: users.name, email: users.email, notionTeamMemberId: users.notionTeamMemberId, teamId: users.teamId });

        user = createdUser as UserRow | undefined;
        if (!user) {
          user = ((teamMemberNotionId
            ? await db.select({ id: users.id, name: users.name, email: users.email, notionTeamMemberId: users.notionTeamMemberId, teamId: users.teamId }).from(users).where(eq(users.notionTeamMemberId, teamMemberNotionId))
            : []) as UserRow[])[0];
        }
      } else {
        user = { id: `dry-run-user-${insertedUsers + 1}`, name: baseName, email: makeImportedEmail(baseName, notionPageId), notionTeamMemberId: teamMemberNotionId, teamId: team.id };
      }

      if (!user) throw new Error(`Failed to create or load user for entry ${notionPageId}`);
      if (teamMemberNotionId) userByNotionId.set(teamMemberNotionId.toLowerCase(), user);
      userByName.set(user.name.trim().toLowerCase(), user);
      insertedUsers++;
      return user;
    }

    async function ensureProject(projectName: string): Promise<ProjectRow> {
      const existing = projectByName.get(projectName.toLowerCase());
      if (existing) return existing as ProjectRow;
      let project: ProjectRow | undefined;
      if (!dryRun) {
        const [createdProject] = await db.insert(projects).values({ name: projectName, createdById: adminCreatedById }).onConflictDoNothing().returning({ id: projects.id, name: projects.name });
        project = createdProject as ProjectRow | undefined;
        if (!project) {
          project = ((await db.select({ id: projects.id, name: projects.name }).from(projects)).find((p) => p.name.toLowerCase() === projectName.toLowerCase())) as ProjectRow | undefined;
        }
      } else {
        project = { id: `dry-run-project-${insertedProjects + 1}`, name: projectName };
      }
      if (!project) throw new Error(`Failed to create or load project ${projectName}`);
      projectByName.set(projectName.toLowerCase(), project);
      insertedProjects++;
      return project;
    }

    for (let i = 0; i < prepared.length; i += batchSize) {
      const batch = prepared.slice(i, i + batchSize);
      for (const item of batch) {
        const user = await ensureUser(item.teamMemberNotionId, item.teamMemberName, item.userKey, item.notionPageId);
        const project = await ensureProject(item.projectName);

        if (!dryRun) {
          const newEntry: NewTimeEntry = {
            userId: user.id,
            projectId: project.id,
            description: item.description,
            startedAt: item.startedAt,
            stoppedAt: item.stoppedAt,
            durationMs: item.durationMs,
            notionPageId: item.notionPageId,
            notionTaskPageId: item.taskPageId,
            notionTaskTitle: item.taskTitle,
            syncedAt: new Date(),
          };

          const [entry] = await db.insert(timeEntries).values(newEntry).onConflictDoNothing().returning({ id: timeEntries.id });
          const entryId = entry?.id ?? (await db.select({ id: timeEntries.id }).from(timeEntries).where(eq(timeEntries.notionPageId, item.notionPageId)))[0]?.id;
          if (!entryId) throw new Error(`Failed to create or load time entry ${item.notionPageId}`);

          if (item.tagNames.length > 0) {
            const existingUserTags = await db.select({ id: tags.id, name: tags.name }).from(tags).where(eq(tags.userId, user.id));
            const tagIds: string[] = [];
            for (const tagName of item.tagNames) {
              let tag = existingUserTags.find((t) => t.name.toLowerCase() === tagName.toLowerCase());
              if (!tag) {
                const [createdTag] = await db.insert(tags).values({ name: tagName, userId: user.id }).onConflictDoNothing().returning({ id: tags.id, name: tags.name });
                if (createdTag) {
                  tag = createdTag;
                  existingUserTags.push(createdTag);
                  insertedTags++;
                }
              }
              if (tag) tagIds.push(tag.id);
            }
            if (tagIds.length > 0) {
              await db.insert(timeEntryTags).values(tagIds.map((tagId) => ({ timeEntryId: entryId, tagId }))).onConflictDoNothing();
            }
          }
        }

        completedIds.add(item.notionPageId.toLowerCase());
        insertedEntries++;
      }

      saveState(completedIds);
      console.log(`Processed ${Math.min(i + batch.length, prepared.length)}/${prepared.length} entries, inserted in this run: ${insertedEntries}`);
    }

    console.log("Import summary");
    console.log(`  Users created: ${insertedUsers}`);
    console.log(`  Teams created: ${insertedTeams}`);
    console.log(`  Projects created: ${insertedProjects}`);
    console.log(`  Entries inserted this run: ${insertedEntries}`);
    console.log(`  Tags created: ${insertedTags}`);
    console.log(`  State saved to: ${statePath}`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
