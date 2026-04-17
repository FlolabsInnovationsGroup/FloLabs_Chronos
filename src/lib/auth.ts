import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import bcrypt from "bcryptjs";
import type { Role } from "@/types";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;

        // Dynamic import to avoid DB init at build time
        try {
          const { findUserByAnyEmail } = await import("./user-email-aliases");
          const { db } = await import("./db");
          const { applicants } = await import("./db/schema");
          const { and, eq, ne, or, sql } = await import("drizzle-orm");

          const user = await findUserByAnyEmail(email.toLowerCase());

          if (!user) return null;
          if (!user.isActive) return null;
          const valid = await bcrypt.compare(password, user.password);
          if (!valid) return null;

          // Access switch: only joined, non-terminated applicants can use Chronos.
          if (db) {
            try {
              const [linkedApplicant] = await db
                .select({
                  stage: applicants.stage,
                  status: applicants.status,
                  role: applicants.role,
                  teamId: applicants.teamId,
                  isActive: applicants.isActive,
                  profilePictureUrl: applicants.profilePictureUrl,
                })
                .from(applicants)
                .where(
                  and(
                    eq(applicants.chronosUserId, user.id),
                    ne(applicants.status, "terminated"),
                    or(
                      sql`lower(${applicants.stage}) = 'joined'`,
                      sql`lower(${applicants.status}) = 'joined'`,
                    ),
                  )
                )
                .limit(1);
              if (!linkedApplicant) return null;
              if (!linkedApplicant.isActive) return null;

              return {
                id: user.id,
                email: user.email,
                name: user.name,
                profilePictureUrl: linkedApplicant.profilePictureUrl ?? user.profilePictureUrl ?? null,
                role: (linkedApplicant.role as Role) ?? (user.role as Role),
                teamId: linkedApplicant.teamId ?? user.teamId,
                isActive: linkedApplicant.isActive,
              };
            } catch {
              // Compatibility fallback while applicant profile columns are being migrated.
              const [joinedApplicant] = await db
                .select({ stage: applicants.stage, status: applicants.status })
                .from(applicants)
                .where(eq(applicants.chronosUserId, user.id))
                .limit(1);
              if (!joinedApplicant) return null;
              const stage = joinedApplicant.stage?.toLowerCase() ?? "";
              const status = joinedApplicant.status?.toLowerCase() ?? "";
              if (status === "terminated") return null;
              if (!(stage === "joined" || status === "joined")) return null;
            }
          }

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            profilePictureUrl: user.profilePictureUrl ?? null,
            role: user.role as Role,
            teamId: user.teamId,
            isActive: user.isActive,
          };
        } catch {
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger }) {
      // On initial sign-in, seed the token from the authorize() return value.
      if (user) {
        const t = token as Record<string, unknown>;
        t.id = user.id;
        t.role = (user as { role?: Role }).role ?? "member";
        t.teamId = (user as { teamId?: string | null }).teamId ?? null;
        t.isActive = (user as { isActive?: boolean }).isActive ?? true;
        t.profilePictureUrl = (user as { profilePictureUrl?: string | null }).profilePictureUrl ?? null;
        t.roleRefreshedAt = Date.now();
      }

      // On subsequent calls (session refresh, "update" trigger), re-read role/isActive
      // from the DB so that admin-applied role changes take effect without re-login.
      const t = token as Record<string, unknown>;
      const userId = t.id as string | undefined;
      const lastRefresh = (t.roleRefreshedAt as number | undefined) ?? 0;
      const REFRESH_INTERVAL_MS = 30_000; // re-check DB every 30 seconds

      if (userId && (trigger === "update" || Date.now() - lastRefresh > REFRESH_INTERVAL_MS)) {
        try {
          const { db } = await import("./db");
          const { applicants, users } = await import("./db/schema");
          const { and, eq, ne, or, sql } = await import("drizzle-orm");

          if (db) {
            let fresh:
              | { role: string | null; teamId: string | null; isActive: boolean; profilePictureUrl: string | null }
              | undefined;
            try {
              [fresh] = await db
                .select({
                  role: applicants.role,
                  teamId: applicants.teamId,
                  isActive: applicants.isActive,
                  profilePictureUrl: applicants.profilePictureUrl,
                })
                .from(applicants)
                .where(
                  and(
                    eq(applicants.chronosUserId, userId),
                    ne(applicants.status, "terminated"),
                    or(
                      sql`lower(${applicants.stage}) = 'joined'`,
                      sql`lower(${applicants.status}) = 'joined'`,
                    ),
                  ),
                )
                .limit(1);
            } catch {
              // Keep fallback below.
            }

            if (fresh) {
              t.role = fresh.role as Role;
              t.teamId = fresh.teamId ?? null;
              t.isActive = fresh.isActive;
              t.profilePictureUrl = fresh.profilePictureUrl ?? null;
              t.roleRefreshedAt = Date.now();

              // If the user has been deactivated, invalidate the session.
              if (!fresh.isActive) {
                return null as unknown as typeof token;
              }
            } else {
              const [legacy] = await db
                .select({
                  role: users.role,
                  teamId: users.teamId,
                  isActive: users.isActive,
                  profilePictureUrl: users.profilePictureUrl,
                })
                .from(users)
                .where(eq(users.id, userId))
                .limit(1);
              if (legacy) {
                t.role = legacy.role as Role;
                t.teamId = legacy.teamId ?? null;
                t.isActive = legacy.isActive;
                t.profilePictureUrl = legacy.profilePictureUrl ?? null;
                t.roleRefreshedAt = Date.now();
              }
            }
          }
        } catch {
          // DB unavailable — keep existing token values, don't crash auth.
        }
      }

      return token;
    },
    async session({ session, token }) {
      const t = token as Record<string, unknown>;
      session.user.id = (t.id as string) ?? "";
      (session.user as { role?: Role }).role = (t.role as Role | undefined) ?? "member";
      session.user.teamId = (t.teamId as string | null | undefined) ?? null;
      session.user.isActive = (t.isActive as boolean | undefined) ?? true;
      session.user.profilePictureUrl = (t.profilePictureUrl as string | null | undefined) ?? null;
      return session;
    },
  },
});

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: Role;
      teamId: string | null;
      isActive: boolean;
      profilePictureUrl?: string | null;
    };
  }
}

