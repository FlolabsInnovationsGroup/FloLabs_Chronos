import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { APP_CONFIG_KEYS, getNotionConfig, setAppConfigValues } from "@/lib/app-config";

const controlSchema = z.object({
  notionApiKey: z.string().optional().default(""),
  notionTasksDbId: z.string().min(1),
  notionTeamMembersDbId: z.string().min(1),
  notionTeamsDbId: z.string().min(1),
  discordBotToken: z.string().optional().default(""),
  discordGuildId: z.string().optional().default(""),
  discordCategoryId: z.string().optional().default(""),
  discordChannelPrefix: z.string().optional().default("chronos"),
});

export async function GET() {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const config = await getNotionConfig();
  const discordBotToken = await (await import("@/lib/app-config")).getAppConfigValue(APP_CONFIG_KEYS.discordBotToken as any);
  const discordGuildId = await (await import("@/lib/app-config")).getAppConfigValue(APP_CONFIG_KEYS.discordGuildId as any);
  const discordCategoryId = await (await import("@/lib/app-config")).getAppConfigValue(APP_CONFIG_KEYS.discordCategoryId as any);
  const discordChannelPrefix = await (await import("@/lib/app-config")).getAppConfigValue(APP_CONFIG_KEYS.discordChannelPrefix as any);

  return NextResponse.json({
    config: {
      notionApiKeyPresent: Boolean(config.notionApiKey),
      notionApiKeyMasked: config.notionApiKey ? `${config.notionApiKey.slice(0, 6)}••••••${config.notionApiKey.slice(-4)}` : "",
      notionTasksDbId: config.notionTasksDbId ?? "",
      notionTeamMembersDbId: config.notionTeamMembersDbId ?? "",
      notionTeamsDbId: config.notionTeamsDbId ?? "",
      discordBotTokenPresent: Boolean(discordBotToken),
      discordGuildId: discordGuildId ?? "",
      discordCategoryId: discordCategoryId ?? "",
      discordChannelPrefix: discordChannelPrefix ?? "chronos",
    },
  });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = controlSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const values: Array<{ key: (typeof APP_CONFIG_KEYS)[keyof typeof APP_CONFIG_KEYS]; value: string; isSecret?: boolean; updatedBy?: string }> = [
    { key: APP_CONFIG_KEYS.notionTasksDbId, value: parsed.data.notionTasksDbId, updatedBy: session.user.id },
    { key: APP_CONFIG_KEYS.notionTeamMembersDbId, value: parsed.data.notionTeamMembersDbId, updatedBy: session.user.id },
    { key: APP_CONFIG_KEYS.notionTeamsDbId, value: parsed.data.notionTeamsDbId, updatedBy: session.user.id },
  ];
  if (parsed.data.notionApiKey.trim()) {
    values.unshift({ key: APP_CONFIG_KEYS.notionApiKey, value: parsed.data.notionApiKey.trim(), isSecret: true, updatedBy: session.user.id });
  }
  if (parsed.data.discordBotToken.trim()) {
    values.push({ key: APP_CONFIG_KEYS.discordBotToken, value: parsed.data.discordBotToken.trim(), isSecret: true, updatedBy: session.user.id });
  }
  if (parsed.data.discordGuildId.trim()) {
    values.push({ key: APP_CONFIG_KEYS.discordGuildId, value: parsed.data.discordGuildId.trim(), updatedBy: session.user.id });
  }
  values.push({ key: APP_CONFIG_KEYS.discordCategoryId, value: parsed.data.discordCategoryId.trim(), updatedBy: session.user.id });
  values.push({ key: APP_CONFIG_KEYS.discordChannelPrefix, value: parsed.data.discordChannelPrefix.trim() || "chronos", updatedBy: session.user.id });

  await setAppConfigValues(values);

  return NextResponse.json({ ok: true });
}
