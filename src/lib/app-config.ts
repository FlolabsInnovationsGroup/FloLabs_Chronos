import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { appConfig } from "@/lib/db/schema";

export const APP_CONFIG_KEYS = {
  notionApiKey: "notion.apiKey",
  notionTasksDbId: "notion.tasksDbId",
  notionTeamMembersDbId: "notion.teamMembersDbId",
  notionTeamsDbId: "notion.teamsDbId",
  discordBotToken: "discord.botToken",
  discordGuildId: "discord.guildId",
  discordCategoryId: "discord.categoryId",
  discordChannelPrefix: "discord.channelPrefix",
} as const;

export type AppConfigKey = (typeof APP_CONFIG_KEYS)[keyof typeof APP_CONFIG_KEYS];

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
    APP_CONFIG_KEYS.notionTasksDbId,
    APP_CONFIG_KEYS.notionTeamMembersDbId,
    APP_CONFIG_KEYS.notionTeamsDbId,
  ]);

  return {
    notionApiKey: process.env.NOTION_API_KEY || map.get(APP_CONFIG_KEYS.notionApiKey) || null,
    notionTasksDbId: process.env.NOTION_TASKS_DB_ID || map.get(APP_CONFIG_KEYS.notionTasksDbId) || null,
    notionTeamMembersDbId:
      process.env.NOTION_TEAM_MEMBERS_DB_ID ||
      process.env.NOTION_ONBOARDINGS_DB_ID ||
      map.get(APP_CONFIG_KEYS.notionTeamMembersDbId) ||
      null,
    notionTeamsDbId: process.env.NOTION_TEAMS_DB_ID || map.get(APP_CONFIG_KEYS.notionTeamsDbId) || null,
  };
}
