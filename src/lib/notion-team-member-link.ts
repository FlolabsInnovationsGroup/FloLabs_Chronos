/** Canonical Notion Team Member page id/url handling for shared `flolabs_users` rows. */

export function normalizeNotionId(id: string): string {
  return id.replace(/-/g, "").toLowerCase();
}

export function formatNotionUuid32(raw32: string): string {
  const s = raw32.replace(/-/g, "");
  if (s.length !== 32) return raw32.trim();
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}

export function tryParseNotionPageId(input: string | null | undefined): string | null {
  if (!input?.trim()) return null;
  const hex = input.trim().replace(/[^a-fA-F0-9]/g, "");
  if (hex.length !== 32) return null;
  return formatNotionUuid32(hex);
}

export function notionTeamMemberPageUrlFromId(id: string): string {
  return `https://www.notion.so/${id.replace(/-/g, "")}`;
}

export function resolveNotionTeamMemberLink(params: {
  notionTeamMemberId?: string | null;
  notionTeamMemberPageUrl?: string | null;
}): { id: string | null; pageUrl: string | null } {
  const fromId = tryParseNotionPageId(params.notionTeamMemberId);
  const fromUrl = tryParseNotionPageId(params.notionTeamMemberPageUrl);
  const id = fromId ?? fromUrl;
  if (!id) {
    const pageUrl = params.notionTeamMemberPageUrl?.trim() || null;
    return { id: null, pageUrl };
  }
  return {
    id,
    pageUrl: params.notionTeamMemberPageUrl?.trim() || notionTeamMemberPageUrlFromId(id),
  };
}

export function effectiveNotionTeamMemberId(params: {
  notionTeamMemberId?: string | null;
  notionTeamMemberPageUrl?: string | null;
}): string | null {
  return resolveNotionTeamMemberLink(params).id;
}
