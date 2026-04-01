import type { TimeEntry } from "@/types";
import { formatDurationHuman } from "@/lib/utils";

/**
 * Send an embed payload to a Discord webhook URL.
 */
export async function sendDiscordEmbed(
  webhookUrl: string,
  embed: object
): Promise<void> {
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

/**
 * Send plain-text Markdown message to a Discord webhook (no embeds).
 * Respects 429 Retry-After when present.
 */
export async function sendDiscordText(webhookUrl: string, content: string): Promise<void> {
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });

  if (res.status === 429) {
    const retryAfter = Number(res.headers.get("Retry-After") ?? "1");
    await new Promise((r) => setTimeout(r, retryAfter * 1000));
    // retry once
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

/** Format a date as YYYY-MM-DD HH:MM:SS */
function fmtDatetime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

/** Format durationMs as Xh Ym Zs */
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

/**
 * Build plain-text notification for a new completed entry.
 */
export function buildEntryAddedMessage(params: {
  userName: string;
  project: string;
  tags: string[];
  description: string;
  durationMs: number;
  startedAt: Date;
  updatedAt: Date;
}): string {
  const { userName, project, tags, description, durationMs, startedAt, updatedAt } = params;
  const tagsStr = tags.length > 0 ? tags.join(", ") : "No tags";
  return [
    "## 🆕 New Time Entry Added",
    `👤 **User**: ${userName}`,
    `📁 **Project:** ${project}`,
    `🏷️ **Tags:** ${tagsStr}`,
    `📝 **Task:** ${description}`,
    `⏱️ **Time Tracked:** ${fmtDurationSecs(durationMs)}`,
    `🗓️ **Start:** ${fmtDatetime(startedAt)}`,
    `🕑 **Updated:** ${fmtDatetime(updatedAt)}`,
    "—",
  ].join("\n");
}

/**
 * Build plain-text notification for an edited entry.
 * Changed fields show ~~old~~ new inline.
 */
export function buildEntryEditedMessage(params: {
  userName: string;
  project: string;
  tags: string[];
  description: string;
  durationMs: number;
  startedAt: Date;
  stoppedAt: Date | null;
  updatedAt: Date;
  changes: Array<{ field: string; oldValue: string; newValue: string }>;
}): string {
  const { userName, project, tags, description, durationMs, startedAt, stoppedAt, updatedAt, changes } = params;
  const tagsStr = tags.length > 0 ? tags.join(", ") : "No tags";
  const changedFields = new Map(changes.map((c) => [c.field, c]));

  function maybeStrike(field: string, current: string): string {
    const ch = changedFields.get(field);
    if (!ch) return current;
    return `~~${ch.oldValue}~~ ${ch.newValue}`;
  }

  const changesSummary = changes.map((c) => `${c.field}: ~~${c.oldValue}~~ → ${c.newValue}`).join(", ");

  const lines = [
    "## ✍️ Time Entry Edited",
    `👤 **User**: ${userName}`,
    `📁 **Project:** ${maybeStrike("project", project)}`,
    `🏷️ **Tags:** ${maybeStrike("tags", tagsStr)}`,
    `📝 **Task:** ${maybeStrike("description", description)}`,
    `⏱️ **Time Tracked:** ${maybeStrike("duration", fmtDurationSecs(durationMs))}`,
    `🗓️ **Start:** ${maybeStrike("startedAt", fmtDatetime(startedAt))}`,
  ];

  if (stoppedAt) {
    lines.push(`🕓 **End:** ${maybeStrike("stoppedAt", fmtDatetime(stoppedAt))}`);
  }

  lines.push(`🕑 **Updated:** ${fmtDatetime(updatedAt)}`);
  if (changesSummary) lines.push(`**changes:** ${changesSummary}`);
  lines.push("—");

  return lines.join("\n");
}

/**
 * Build plain-text notification for a deleted entry.
 * All values wrapped in strikethrough.
 */
export function buildEntryDeletedMessage(params: {
  userName: string;
  project: string;
  tags: string[];
  description: string;
  durationMs: number;
  startedAt: Date;
  deletedAt: Date;
}): string {
  const { userName, project, tags, description, durationMs, startedAt, deletedAt } = params;
  const tagsStr = tags.length > 0 ? tags.join(", ") : "No tags";
  return [
    "## 🗑️ Time Entry Deleted",
    `👤 **User**: ~~${userName}~~`,
    `📁 **Project:** ~~${project}~~`,
    `🏷️ **Tags:** ~~${tagsStr}~~`,
    `📝 **Task:** ~~${description}~~`,
    `⏱️ **Time Tracked:** ~~${fmtDurationSecs(durationMs)}~~`,
    `🗓️ **Start:** ~~${fmtDatetime(startedAt)}~~`,
    `🕑 **Deleted detected:** ${fmtDatetime(deletedAt)}`,
    "—",
  ].join("\n");
}

/**
 * Build an embed for when a timer is started.
 */
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
    color: 0x366769, // Primary teal in decimal
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

/**
 * Build an embed for when a timer is stopped.
 */
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
    color: 0x295a5d, // Darker teal
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

/**
 * Convenience: send timer start notification to a webhook.
 */
export async function sendTimerStartNotification(
  webhookUrl: string,
  userName: string,
  projectName: string,
  description: string
): Promise<void> {
  await sendDiscordEmbed(webhookUrl, buildTimerStartEmbed(userName, projectName, description));
}

/**
 * Convenience: send timer stop notification to a webhook.
 */
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

/**
 * Build a daily summary embed from a list of completed entries.
 */
export function buildDailySummaryEmbed(
  userName: string,
  entries: TimeEntry[]
): object {
  const totalMs = entries.reduce((sum, e) => sum + (e.durationMs ?? 0), 0);
  const totalHours = (totalMs / 3_600_000).toFixed(1);

  // Group by project
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
    color: 0x755a40, // Tertiary brown
    fields: projectFields.length > 0 ? projectFields : undefined,
    footer: {
      text: "FloLabs Chronos Daily Digest",
    },
    timestamp: new Date().toISOString(),
  };
}

/**
 * Convenience: send daily summary to a webhook.
 */
export async function sendDailySummary(
  webhookUrl: string,
  userName: string,
  entries: TimeEntry[]
): Promise<void> {
  await sendDiscordEmbed(webhookUrl, buildDailySummaryEmbed(userName, entries));
}
