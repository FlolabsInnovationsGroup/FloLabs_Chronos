/**
 * Role string checks safe for client components (no DB / server-only imports).
 * Keeps parity with {@link isAdmin} in permissions.ts.
 */
export function isAdminLikeRole(role: string | undefined | null): boolean {
  const value = String(role ?? "").trim().toLowerCase();
  return (
    value === "admin" ||
    value === "administrator" ||
    value === "hr" ||
    value === "human resources" ||
    value === "human_resources"
  );
}

/** Chronos admins who may create and manage invitation links (excludes HR). */
export function canManageInvitationsRole(role: string | undefined | null): boolean {
  const value = String(role ?? "").trim().toLowerCase();
  return value === "admin" || value === "administrator";
}
