import type { TimeEntry } from "@/types";
import { formatDurationHuman } from "@/lib/utils";

const NOTION_API_BASE = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";
const webhookCache = new Map<string, string | null>();
const BRAND_PRIMARY = 0x366769;
const BRAND_DARK = 0x295a5d;
const BRAND_WARM = 0x755a40;

function notionHeaders() {
  return {
    Authorization: `Bearer ${process.env.NOTION_API_KEY}`,
    "Content-Type": "application/json",
    "Notion-Version": NOTION_VERSION,
  };
}

export async function sendDiscordEmbed(webhookUrl: string, embed: object): Promise<void> {
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ embeds: [embed] }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Discord webhook failed (${res.status}): ${text}`);
  }
}

export async function sendDiscordText(webhookUrl: string, content: string): Promise<void> {
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });

  if (res.status === 429) {
    const retryAfter = Number(res.headers.get("Retry-After") ?? "1");
    await new Promise((r) => setTimeout(r, retryAfter * 1000));
    const retry = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    if (!retry.ok) {
      const text = await retry.text();
      throw new Error(`Discord webhook failed after retry (${retry.status}): ${text}`);
    }
    return;
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Discord webhook failed (${res.status}): ${text}`);
  }
}

export async function resolveDiscordWebhookForTeamMember(
  notionTeamMemberId?: string | null
): Promise<string | null> {
  if (!notionTeamMemberId || !process.env.NOTION_API_KEY) return null;
  if (webhookCache.has(notionTeamMemberId)) return webhookCache.get(notionTeamMemberId) ?? null;

  const res = await fetch(`${NOTION_API_BASE}/pages/${notionTeamMemberId}`, {
    headers: notionHeaders(),
  });

  if (!res.ok) {
    webhookCache.set(notionTeamMemberId, null);
    return null;
  }

  const page = (await res.json()) as {
    properties?: Record<string, {
      type: string;
      url?: string | null;
      rich_text?: { plain_text: string }[];
      title?: { plain_text: string }[];
    }>;
  };

  const props = page.properties ?? {};
  const candidates = [props["Webhook"], props["webhook"], props["Discord Webhook"], props["discordWebhookUrl"]].filter(Boolean);

  for (const prop of candidates) {
    if (!prop) continue;
    if (prop.type === "url" && prop.url) {
      webhookCache.set(notionTeamMemberId, prop.url);
      return prop.url;
    }
    if (prop.type === "rich_text" && prop.rich_text?.length) {
      const text = prop.rich_text.map((t) => t.plain_text).join("").trim();
      if (text) {
        webhookCache.set(notionTeamMemberId, text);
        return text;
      }
    }
    if (prop.type === "title" && prop.title?.length) {
      const text = prop.title.map((t) => t.plain_text).join("").trim();
      if (text) {
        webhookCache.set(notionTeamMemberId, text);
        return text;
      }
    }
  }

  webhookCache.set(notionTeamMemberId, null);
  return null;
}

function fmtDatetime(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(d).replace(",", "") + " UTC";
}

function formatChangeValue(field: string, value: string): string {
  if ((field === "startedAt" || field === "stoppedAt") && value) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return fmtDatetime(parsed);
  }
  if (field === "duration" && /^\d+$/.test(value)) {
    return fmtDurationSecs(Number(value));
  }
  return value;
}

function fmtDurationSecs(ms: number): string {
  const totalSecs = Math.floor(ms / 1000);
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  const parts: string[] = [];
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  if (s || parts.length === 0) parts.push(`${s}s`);
  return parts.join(" ");
}

function taskLabel(taskTitle?: string | null) {
  return taskTitle?.trim() ? taskTitle.trim() : "No task linked";
}

function buildEntryEmbedBase(params: {
  title: string;
  color: number;
  userName: string;
  project: string;
  tags: string[];
  description: string;
  taskTitle?: string | null;
  durationMs: number;
  startedAt: Date;
  endedAt?: Date | null;
  updatedAt?: Date;
  deletedAt?: Date;
  changes?: Array<{ field: string; oldValue: string; newValue: string }>;
}) {
  const fields = [
    { name: "User", value: params.userName || "Unknown", inline: true },
    { name: "Project", value: params.project || "Unknown", inline: true },
    { name: "Task", value: taskLabel(params.taskTitle), inline: false },
    { name: "Description", value: params.description?.trim() || "No description", inline: false },
    { name: "Tags", value: params.tags.length > 0 ? params.tags.join(", ") : "No tags", inline: false },
    { name: "Duration", value: fmtDurationSecs(params.durationMs), inline: true },
    { name: "Start", value: fmtDatetime(params.startedAt), inline: true },
  ];

  if (params.endedAt) {
    fields.push({ name: "End", value: fmtDatetime(params.endedAt), inline: true });
  }

  if (params.updatedAt) {
    fields.push({ name: "Updated", value: fmtDatetime(params.updatedAt), inline: true });
  }

  if (params.deletedAt) {
    fields.push({ name: "Deleted detected", value: fmtDatetime(params.deletedAt), inline: true });
  }

  if (params.changes && params.changes.length > 0) {
    const rendered = params.changes
      .map((c) => `• **${c.field}**: ${formatChangeValue(c.field, c.oldValue)} → ${formatChangeValue(c.field, c.newValue)}`)
      .join("\n")
      .slice(0, 1000);
    fields.push({ name: "Changes", value: rendered, inline: false });
  }

  return {
    title: params.title,
    color: params.color,
    fields,
    footer: { text: "FloLabs Chronos" },
    timestamp: new Date().toISOString(),
  };
}

export function buildEntryAddedEmbed(params: {
  userName: string;
  project: string;
  tags: string[];
  description: string;
  taskTitle?: string | null;
  durationMs: number;
  startedAt: Date;
  updatedAt: Date;
}) {
  return buildEntryEmbedBase({
    title: "New Time Entry Added",
    color: BRAND_PRIMARY,
    ...params,
  });
}

export function buildEntryEditedEmbed(params: {
  userName: string;
  project: string;
  tags: string[];
  description: string;
  taskTitle?: string | null;
  durationMs: number;
  startedAt: Date;
  stoppedAt: Date | null;
  updatedAt: Date;
  changes: Array<{ field: string; oldValue: string; newValue: string }>;
}) {
  return buildEntryEmbedBase({
    title: "Time Entry Edited",
    color: BRAND_DARK,
    userName: params.userName,
    project: params.project,
    tags: params.tags,
    description: params.description,
    taskTitle: params.taskTitle,
    durationMs: params.durationMs,
    startedAt: params.startedAt,
    endedAt: params.stoppedAt,
    updatedAt: params.updatedAt,
    changes: params.changes,
  });
}

export function buildEntryDeletedEmbed(params: {
  userName: string;
  project: string;
  tags: string[];
  description: string;
  taskTitle?: string | null;
  durationMs: number;
  startedAt: Date;
  deletedAt: Date;
}) {
  return buildEntryEmbedBase({
    title: "Time Entry Deleted",
    color: 0xa73b21,
    userName: params.userName,
    project: params.project,
    tags: params.tags,
    description: params.description,
    taskTitle: params.taskTitle,
    durationMs: params.durationMs,
    startedAt: params.startedAt,
    deletedAt: params.deletedAt,
  });
}

export function buildTimerStartEmbed(
  userName: string,
  projectName: string,
  description: string
): object {
  return {
    title: "Timer Started",
    description: description
      ? `**${userName}** started working on: *${description}*`
      : `**${userName}** started a new session`,
    color: BRAND_PRIMARY,
    fields: [
      {
        name: "Project",
        value: projectName,
        inline: true,
      },
      {
        name: "Started at",
        value: new Date().toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        }),
        inline: true,
      },
    ],
    footer: {
      text: "FloLabs Chronos",
    },
    timestamp: new Date().toISOString(),
  };
}

export function buildTimerStopEmbed(
  userName: string,
  projectName: string,
  description: string,
  durationMs: number
): object {
  return {
    title: "Session Logged",
    description: description
      ? `**${userName}** finished: *${description}*`
      : `**${userName}** stopped their session`,
    color: BRAND_DARK,
    fields: [
      {
        name: "Project",
        value: projectName,
        inline: true,
      },
      {
        name: "Duration",
        value: formatDurationHuman(durationMs),
        inline: true,
      },
    ],
    footer: {
      text: "FloLabs Chronos",
    },
    timestamp: new Date().toISOString(),
  };
}

export async function sendTimerStartNotification(
  webhookUrl: string,
  userName: string,
  projectName: string,
  description: string
): Promise<void> {
  await sendDiscordEmbed(webhookUrl, buildTimerStartEmbed(userName, projectName, description));
}

export async function sendTimerStopNotification(
  webhookUrl: string,
  userName: string,
  projectName: string,
  description: string,
  durationMs: number
): Promise<void> {
  await sendDiscordEmbed(
    webhookUrl,
    buildTimerStopEmbed(userName, projectName, description, durationMs)
  );
}

export async function notifyEntryAdded(params: {
  notionTeamMemberId?: string | null;
  userName: string;
  project: string;
  tags: string[];
  description: string;
  taskTitle?: string | null;
  durationMs: number;
  startedAt: Date;
  updatedAt: Date;
}) {
  const webhookUrl = await resolveDiscordWebhookForTeamMember(params.notionTeamMemberId);
  if (!webhookUrl) return false;
  await sendDiscordEmbed(webhookUrl, buildEntryAddedEmbed(params));
  return true;
}

export async function notifyEntryEdited(params: {
  notionTeamMemberId?: string | null;
  userName: string;
  project: string;
  tags: string[];
  description: string;
  taskTitle?: string | null;
  durationMs: number;
  startedAt: Date;
  stoppedAt: Date | null;
  updatedAt: Date;
  changes: Array<{ field: string; oldValue: string; newValue: string }>;
}) {
  const webhookUrl = await resolveDiscordWebhookForTeamMember(params.notionTeamMemberId);
  if (!webhookUrl) return false;
  await sendDiscordEmbed(webhookUrl, buildEntryEditedEmbed(params));
  return true;
}

export async function notifyEntryDeleted(params: {
  notionTeamMemberId?: string | null;
  userName: string;
  project: string;
  tags: string[];
  description: string;
  taskTitle?: string | null;
  durationMs: number;
  startedAt: Date;
  deletedAt: Date;
}) {
  const webhookUrl = await resolveDiscordWebhookForTeamMember(params.notionTeamMemberId);
  if (!webhookUrl) return false;
  await sendDiscordEmbed(webhookUrl, buildEntryDeletedEmbed(params));
  return true;
}

export function buildDailySummaryEmbed(
  userName: string,
  entries: TimeEntry[]
): object {
  const totalMs = entries.reduce((sum, e) => sum + (e.durationMs ?? 0), 0);
  const totalHours = (totalMs / 3_600_000).toFixed(1);

  const byProject = new Map<string, number>();
  for (const entry of entries) {
    const name = entry.project?.name ?? "Unknown";
    byProject.set(name, (byProject.get(name) ?? 0) + (entry.durationMs ?? 0));
  }

  const projectFields = Array.from(byProject.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([name, ms]) => ({
      name,
      value: formatDurationHuman(ms),
      inline: true,
    }));

  return {
    title: `Daily Summary — ${new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}`,
    description: `**${userName}** logged **${totalHours} hours** across **${entries.length} session${entries.length !== 1 ? "s" : ""}** today.`,
    color: BRAND_WARM,
    fields: projectFields.length > 0 ? projectFields : undefined,
    footer: {
      text: "FloLabs Chronos Daily Digest",
    },
    timestamp: new Date().toISOString(),
  };
}

export async function sendDailySummary(
  webhookUrl: string,
  userName: string,
  entries: TimeEntry[]
): Promise<void> {
  await sendDiscordEmbed(webhookUrl, buildDailySummaryEmbed(userName, entries));
}
