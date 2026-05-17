import { effectiveNotionTeamMemberId } from "@/lib/notion-team-member-link";

export function hasNotionTeamMemberLink(input: {
  notionTeamMemberId?: string | null;
  notionTeamMemberPageUrl?: string | null;
}): boolean {
  return Boolean(
    effectiveNotionTeamMemberId({
      notionTeamMemberId: input.notionTeamMemberId,
      notionTeamMemberPageUrl: input.notionTeamMemberPageUrl,
    }),
  );
}

/**
 * Pipeline status for shared `flolabs_users` rows.
 * `joined` requires a Notion Team Member link; otherwise default to `applying`.
 */
export function resolveApplicantPipelineStatus(input: {
  status?: unknown;
  stage?: unknown;
  notionTeamMemberId?: string | null;
  notionTeamMemberPageUrl?: string | null;
}): string {
  const raw = String(input.status ?? "").trim().toLowerCase();
  const hasNotion = hasNotionTeamMemberLink(input);

  if (!raw || raw === "active") {
    return hasNotion ? "joined" : "applying";
  }
  if (raw === "signed") return "signed";
  if (raw === "joined" && !hasNotion) return "applying";
  return raw;
}

export function resolveApplicantPipelineStage(input: {
  stage?: unknown;
  status: string;
}): string {
  const rawStage = String(input.stage ?? "").trim().toLowerCase();
  const status = String(input.status ?? "").trim().toLowerCase();

  if (status === "applying" && (!rawStage || rawStage === "joined" || rawStage === "active" || rawStage === "chronos_synced")) {
    return "application_submitted";
  }
  if (!rawStage) return status === "joined" ? "joined" : "application_submitted";
  return rawStage === "active" ? "joined" : rawStage;
}
