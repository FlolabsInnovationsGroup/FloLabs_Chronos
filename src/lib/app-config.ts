import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { appConfig } from "@/lib/db/schema";

export const APP_CONFIG_KEYS = {
  notionApiKey: "notion.apiKey",
  notionDatabaseId: "notion.databaseId",
  notionTasksDbId: "notion.tasksDbId",
  notionTeamMembersDbId: "notion.teamMembersDbId",
  notionOnboardingsDbId: "notion.onboardingsDbId",
  notionTeamsDbId: "notion.teamsDbId",
  notionMasterClassesIndexDbId: "notion.masterClassesIndexDbId",
  discordBotToken: "discord.botToken",
  discordGuildId: "discord.guildId",
  discordCategoryId: "discord.categoryId",
  discordChannelPrefix: "discord.channelPrefix",
} as const;

export type AppConfigKey = (typeof APP_CONFIG_KEYS)[keyof typeof APP_CONFIG_KEYS];

/** Treat empty, whitespace-only, and common placeholder sentinels as unset for env-driven Notion IDs. */
function notionEnvOrNull(value: string | undefined): string | null {
  if (value == null) return null;
  const t = value.trim();
  if (!t || t === "-") return null;
  return t;
}

/** First non-empty Notion integration secret; skips `-` / blank placeholders common in App Runner templates. */
function pickNotionIntegrationSecret(...candidates: (string | undefined | null)[]): string | null {
  for (const c of candidates) {
    if (c == null) continue;
    const t = String(c).trim();
    if (t.length > 0 && t !== "-") return t;
  }
  return null;
}

/**
 * Canonical 32-char hex database id for Notion APIs (accepts hyphenated UUID, bare 32 hex, or Notion URLs).
 */
export function normalizeNotionDatabaseIdInput(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  const uuidInUrl = t.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
  if (uuidInUrl) {
    const h = uuidInUrl[1]!.replace(/-/g, "").toLowerCase();
    if (h.length === 32) return h;
  }
  const compact = t.replace(/-/g, "");
  if (/^[0-9a-f]{32}$/i.test(compact)) return compact.toLowerCase();
  return t;
}

export async function getAppConfigValue(key: AppConfigKey): Promise<string | null> {
  if (!db) return null;
  const [row] = await db.select().from(appConfig).where(eq(appConfig.key, key)).limit(1);
  return row?.value ?? null;
}

export async function getAppConfigMap(keys: AppConfigKey[]) {
  if (!db || keys.length === 0) return new Map<AppConfigKey, string>();
  const rows = await db.select().from(appConfig).where(inArray(appConfig.key, keys));
  const map = new Map<AppConfigKey, string>();
  for (const row of rows) {
    map.set(row.key as AppConfigKey, row.value);
  }
  return map;
}

export async function setAppConfigValues(values: Array<{ key: AppConfigKey; value: string; isSecret?: boolean; updatedBy?: string }>) {
  if (!db || values.length === 0) return;
  for (const item of values) {
    const existing = await db.select().from(appConfig).where(eq(appConfig.key, item.key)).limit(1);
    if (existing.length > 0) {
      await db
        .update(appConfig)
        .set({
          value: item.value,
          isSecret: item.isSecret ?? false,
          updatedBy: item.updatedBy,
          updatedAt: new Date(),
        })
        .where(eq(appConfig.key, item.key));
    } else {
      await db.insert(appConfig).values({
        key: item.key,
        value: item.value,
        isSecret: item.isSecret ?? false,
        updatedBy: item.updatedBy,
      });
    }
  }
}

export async function getNotionConfig() {
  const map = await getAppConfigMap([
    APP_CONFIG_KEYS.notionApiKey,
    APP_CONFIG_KEYS.notionDatabaseId,
    APP_CONFIG_KEYS.notionTasksDbId,
    APP_CONFIG_KEYS.notionTeamMembersDbId,
    APP_CONFIG_KEYS.notionOnboardingsDbId,
    APP_CONFIG_KEYS.notionTeamsDbId,
    APP_CONFIG_KEYS.notionMasterClassesIndexDbId,
  ]);

  const notionApiKey = pickNotionIntegrationSecret(
    process.env.NOTION_API_KEY,
    process.env.NOTION_TOKEN,
    process.env.NOTION_INTEGRATION_TOKEN,
    map.get(APP_CONFIG_KEYS.notionApiKey),
  );

  const rawTimeEntriesDbId =
    notionEnvOrNull(process.env.NOTION_DATABASE_ID) || map.get(APP_CONFIG_KEYS.notionDatabaseId) || null;
  const notionDatabaseId = rawTimeEntriesDbId ? normalizeNotionDatabaseIdInput(rawTimeEntriesDbId) || rawTimeEntriesDbId : null;
  let notionTasksDbId = notionEnvOrNull(process.env.NOTION_TASKS_DB_ID);
  let notionTeamMembersDbId = notionEnvOrNull(process.env.NOTION_TEAM_MEMBERS_DB_ID);
  let notionTeamsDbId = notionEnvOrNull(process.env.NOTION_TEAMS_DB_ID);
  let notionOnboardingsDbId = notionEnvOrNull(process.env.NOTION_ONBOARDINGS_DB_ID);

  if (notionApiKey && notionDatabaseId) {
    try {
      const { resolveNotionDatabaseIdsFromRelations } = await import("@/lib/notion");
      const derived = await resolveNotionDatabaseIdsFromRelations(notionApiKey, notionDatabaseId);
      if (!notionTasksDbId) notionTasksDbId = derived.tasksDbId;
      if (!notionTeamMembersDbId) notionTeamMembersDbId = derived.teamMembersDbId;
      if (!notionTeamsDbId) notionTeamsDbId = derived.teamsDbId;
      if (!notionOnboardingsDbId) notionOnboardingsDbId = derived.onboardingsDbId;
    } catch {
      /* ignore */
    }
  }

  if (!notionTasksDbId) notionTasksDbId = map.get(APP_CONFIG_KEYS.notionTasksDbId) || null;
  if (!notionTeamMembersDbId) notionTeamMembersDbId = map.get(APP_CONFIG_KEYS.notionTeamMembersDbId) || null;
  if (!notionTeamsDbId) notionTeamsDbId = map.get(APP_CONFIG_KEYS.notionTeamsDbId) || null;
  if (!notionOnboardingsDbId) notionOnboardingsDbId = map.get(APP_CONFIG_KEYS.notionOnboardingsDbId) || null;

  return {
    notionApiKey,
    notionDatabaseId,
    notionTasksDbId,
    notionTeamMembersDbId,
    notionOnboardingsDbId,
    notionTeamsDbId,
    notionMasterClassesIndexDbId:
      notionEnvOrNull(process.env.NOTION_MASTERCLASSES_INDEX_DB_ID) ||
      map.get(APP_CONFIG_KEYS.notionMasterClassesIndexDbId) ||
      null,
  };
}
