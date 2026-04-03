import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { APP_CONFIG_KEYS, getNotionConfig, setAppConfigValues } from "@/lib/app-config";

const controlSchema = z.object({
  notionApiKey: z.string().min(1),
  notionTasksDbId: z.string().min(1),
  notionTeamMembersDbId: z.string().min(1),
  notionTeamsDbId: z.string().min(1),
});

export async function GET() {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const config = await getNotionConfig();
  return NextResponse.json({
    config: {
      notionApiKeyPresent: Boolean(config.notionApiKey),
      notionTasksDbId: config.notionTasksDbId ?? "",
      notionTeamMembersDbId: config.notionTeamMembersDbId ?? "",
      notionTeamsDbId: config.notionTeamsDbId ?? "",
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

  await setAppConfigValues([
    { key: APP_CONFIG_KEYS.notionApiKey, value: parsed.data.notionApiKey, isSecret: true, updatedBy: session.user.id },
    { key: APP_CONFIG_KEYS.notionTasksDbId, value: parsed.data.notionTasksDbId, updatedBy: session.user.id },
    { key: APP_CONFIG_KEYS.notionTeamMembersDbId, value: parsed.data.notionTeamMembersDbId, updatedBy: session.user.id },
    { key: APP_CONFIG_KEYS.notionTeamsDbId, value: parsed.data.notionTeamsDbId, updatedBy: session.user.id },
  ]);

  return NextResponse.json({ ok: true });
}
