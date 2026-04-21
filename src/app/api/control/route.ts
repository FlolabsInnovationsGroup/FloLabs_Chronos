import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { APP_CONFIG_KEYS, getNotionConfig, setAppConfigValues } from "@/lib/app-config";
import { chronosUserIdFromSessionUser } from "@/lib/chronos-session";

const controlSchema = z.object({
  notionApiKey: z.string().optional().default(""),
  notionMasterClassesIndexDbId: z.string().min(1),
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
      timeEntriesDatabaseIdConfigured: Boolean(process.env.NOTION_DATABASE_ID),
      notionOnboardingsDbId: config.notionOnboardingsDbId ?? "",
      notionTeamsDbId: config.notionTeamsDbId ?? "",
      notionMasterClassesIndexDbId: config.notionMasterClassesIndexDbId ?? "",
      discordBotTokenPresent: Boolean(discordBotToken),
      discordBotTokenMasked: discordBotToken ? `${discordBotToken.slice(0, 6)}••••••${discordBotToken.slice(-4)}` : "",
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

  const chronosUserId = chronosUserIdFromSessionUser(session.user);
  if (!chronosUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const values: Array<{ key: (typeof APP_CONFIG_KEYS)[keyof typeof APP_CONFIG_KEYS]; value: string; isSecret?: boolean; updatedBy?: string }> = [
    { key: APP_CONFIG_KEYS.notionMasterClassesIndexDbId, value: parsed.data.notionMasterClassesIndexDbId, updatedBy: chronosUserId },
  ];
  if (parsed.data.notionApiKey.trim()) {
    values.unshift({ key: APP_CONFIG_KEYS.notionApiKey, value: parsed.data.notionApiKey.trim(), isSecret: true, updatedBy: chronosUserId });
  }
  if (parsed.data.discordBotToken.trim()) {
    values.push({ key: APP_CONFIG_KEYS.discordBotToken, value: parsed.data.discordBotToken.trim(), isSecret: true, updatedBy: chronosUserId });
  }
  if (parsed.data.discordGuildId.trim()) {
    values.push({ key: APP_CONFIG_KEYS.discordGuildId, value: parsed.data.discordGuildId.trim(), updatedBy: chronosUserId });
  }
  values.push({ key: APP_CONFIG_KEYS.discordCategoryId, value: parsed.data.discordCategoryId.trim(), updatedBy: chronosUserId });
  values.push({ key: APP_CONFIG_KEYS.discordChannelPrefix, value: parsed.data.discordChannelPrefix.trim() || "chronos", updatedBy: chronosUserId });

  await setAppConfigValues(values);

  return NextResponse.json({ ok: true });
}
