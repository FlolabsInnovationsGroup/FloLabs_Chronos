import { randomBytes } from "crypto";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function createInvitationToken(): string {
  return randomBytes(24).toString("hex");
}

export function buildInviteUrl(token: string, requestUrl?: string): string {
  const baseUrl =
    process.env.APP_URL ??
    process.env.NEXTAUTH_URL ??
    (requestUrl ? new URL(requestUrl).origin : "http://localhost:3000");

  return `${baseUrl.replace(/\/$/, "")}/register?invite=${encodeURIComponent(token)}`;
}

export function createTeamSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}
