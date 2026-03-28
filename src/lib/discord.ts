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
