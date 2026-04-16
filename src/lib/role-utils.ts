/**
 * Role string checks safe for client components (no DB / server-only imports).
 * Keeps parity with {@link isAdmin} in permissions.ts.
 */
export function isAdminLikeRole(role: string | undefined | null): boolean {
  return role === "admin" || role === "hr";
}
