import { APP_CONFIG_KEYS, getAppConfigMap } from "@/lib/app-config";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const DISCORD_API_BASE = "https://discord.com/api/v10";

const DISCORD_CONFIG_KEYS = {
  botToken: "discord.botToken",
  guildId: "discord.guildId",
  categoryId: "discord.categoryId",
  channelPrefix: "discord.channelPrefix",
} as const;

export type DiscordConfigKey = (typeof DISCORD_CONFIG_KEYS)[keyof typeof DISCORD_CONFIG_KEYS];

async function getDiscordConfig() {
  const map = await getAppConfigMap([
    DISCORD_CONFIG_KEYS.botToken as any,
    DISCORD_CONFIG_KEYS.guildId as any,
    DISCORD_CONFIG_KEYS.categoryId as any,
    DISCORD_CONFIG_KEYS.channelPrefix as any,
  ] as any);

  return {
    botToken: map.get(DISCORD_CONFIG_KEYS.botToken as any) ?? null,
    guildId: map.get(DISCORD_CONFIG_KEYS.guildId as any) ?? null,
    categoryId: map.get(DISCORD_CONFIG_KEYS.categoryId as any) ?? null,
    channelPrefix: map.get(DISCORD_CONFIG_KEYS.channelPrefix as any) ?? "chronos",
  };
}

function discordHeaders(botToken: string) {
  return {
    Authorization: `Bot ${botToken}`,
    "Content-Type": "application/json",
  };
}

function slugifyChannelName(name: string, prefix: string) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${prefix}-${base || "member"}`.slice(0, 95);
}

async function listGuildChannels(botToken: string, guildId: string) {
  const res = await fetch(`${DISCORD_API_BASE}/guilds/${guildId}/channels`, {
    headers: discordHeaders(botToken),
  });
  if (!res.ok) throw new Error(`Discord channel list failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as Array<{ id: string; name: string; type: number; parent_id?: string | null }>;
}

async function createGuildChannel(botToken: string, guildId: string, params: { name: string; categoryId?: string | null }): Promise<{ id: string; name: string; type: number; parent_id?: string | null }> {
  const res = await fetch(`${DISCORD_API_BASE}/guilds/${guildId}/channels`, {
    method: "POST",
    headers: discordHeaders(botToken),
    body: JSON.stringify({
      name: params.name,
      type: 0,
      parent_id: params.categoryId || undefined,
    }),
  });
  if (!res.ok) throw new Error(`Discord channel create failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as { id: string; name: string; type: number; parent_id?: string | null };
}

async function listChannelWebhooks(botToken: string, channelId: string) {
  const res = await fetch(`${DISCORD_API_BASE}/channels/${channelId}/webhooks`, {
    headers: discordHeaders(botToken),
  });
  if (!res.ok) throw new Error(`Discord webhook list failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as Array<{ id: string; token?: string; name?: string }>;
}

async function createChannelWebhook(botToken: string, channelId: string, name: string) {
  const res = await fetch(`${DISCORD_API_BASE}/channels/${channelId}/webhooks`, {
    method: "POST",
    headers: discordHeaders(botToken),
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(`Discord webhook create failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as { id: string; token: string; name: string };
}

function webhookUrl(webhookId: string, token: string) {
  return `https://discord.com/api/webhooks/${webhookId}/${token}`;
}

export async function ensureDiscordResourcesForUser(params: { userId: string; name: string }) {
  const config = await getDiscordConfig();
  if (!config.botToken || !config.guildId) {
    return { ok: false as const, reason: "discord-not-configured" };
  }

  const desiredChannelName = slugifyChannelName(params.name, config.channelPrefix || "chronos");
  const channels = await listGuildChannels(config.botToken, config.guildId);
  let channel = channels.find((c) => c.type === 0 && c.name === desiredChannelName && (!config.categoryId || c.parent_id === config.categoryId));
  if (!channel) {
    channel = await createGuildChannel(config.botToken, config.guildId, {
      name: desiredChannelName,
      categoryId: config.categoryId,
    });
  }

  const webhooks = await listChannelWebhooks(config.botToken, channel.id);
  let hook = webhooks.find((w) => w.token && w.name === "FloLabs Chronos");
  if (!hook || !hook.token) {
    hook = await createChannelWebhook(config.botToken, channel.id, "FloLabs Chronos");
  }
  if (!hook.token) {
    throw new Error("Discord webhook token missing after provisioning");
  }

  const url = webhookUrl(hook.id, hook.token);

  if (db) {
    await db.update(users).set({ discordWebhookUrl: url, updatedAt: new Date() }).where(eq(users.id, params.userId));
  }

  return { ok: true as const, channelId: channel.id, webhookUrl: url };
}

export { DISCORD_CONFIG_KEYS };
