import { randomBytes } from "crypto";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Same resolution order as invite links; use for password reset and any emailed deep links. */
export function resolvePublicAppOrigin(requestUrl?: string): string {
  const base =
    process.env.APP_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    (requestUrl ? new URL(requestUrl).origin : "http://localhost:3000");
  return base.replace(/\/$/, "");
}

export function createInvitationToken(): string {
  return randomBytes(24).toString("hex");
}

export function buildInviteUrl(token: string, requestUrl?: string): string {
  return `${resolvePublicAppOrigin(requestUrl)}/register?invite=${encodeURIComponent(token)}`;
}

export function createTeamSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}
