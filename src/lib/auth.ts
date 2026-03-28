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
    async jwt({ token, user }) {
      if (user) {
        const t = token as Record<string, unknown>;
        t.id = user.id;
        t.role = (user as { role?: Role }).role ?? "member";
        t.teamId = (user as { teamId?: string | null }).teamId ?? null;
        t.isActive = (user as { isActive?: boolean }).isActive ?? true;
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

