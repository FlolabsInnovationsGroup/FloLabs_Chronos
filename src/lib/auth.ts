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
          const { db } = await import("./db");
          const { users } = await import("./db/schema");
          const { eq } = await import("drizzle-orm");

          if (!db) return null;

          const [user] = await db
            .select()
            .from(users)
            .where(eq(users.email, email.toLowerCase()))
            .limit(1);

          if (!user) return null;
          if (!user.isActive) return null;

          const valid = await bcrypt.compare(password, user.password);
          if (!valid) return null;

          return {
            id: user.id,
            email: user.email,
            name: user.name,
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
          const { users } = await import("./db/schema");
          const { eq } = await import("drizzle-orm");

          if (db) {
            const [fresh] = await db
              .select({ role: users.role, teamId: users.teamId, isActive: users.isActive })
              .from(users)
              .where(eq(users.id, userId))
              .limit(1);

            if (fresh) {
              t.role = fresh.role as Role;
              t.teamId = fresh.teamId ?? null;
              t.isActive = fresh.isActive;
              t.roleRefreshedAt = Date.now();

              // If the user has been deactivated, invalidate the session.
              if (!fresh.isActive) {
                return null as unknown as typeof token;
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
    };
  }
}

