import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { chronosAccessDisabled, normalizeApplicantStatus } from "@/lib/applicant-status";
import type { ApplicantStatus, Role } from "@/types";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function applicantAccessEnabled(input: { stage?: string | null; status?: string | null; isActive?: boolean | null }) {
  const stage = String(input.stage ?? "").trim().toLowerCase();
  const status = String(input.status ?? "").trim().toLowerCase();
  if (!Boolean(input.isActive) || chronosAccessDisabled(status)) return false;
  return stage === "joined" || status === "joined" || status === "active" || status === "signed";
}

function normalizeRole(input: string | null | undefined): Role {
  const value = String(input ?? "").trim().toLowerCase();
  if (value === "admin" || value === "administrator") return "admin";
  if (value === "team_lead" || value === "team lead" || value === "teamlead") return "team_lead";
  if (value === "hr" || value === "human resources" || value === "human_resources") return "hr";
  return "member";
}

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

        try {
          const { findApplicantForCredentialEmail } = await import("./applicant-auth");
          const { findUserByAnyEmail } = await import("./user-email-aliases");
          const { db } = await import("./db");
          const { users } = await import("./db/schema");
          const { eq } = await import("drizzle-orm");

          if (!db) return null;

          const applicant = await findApplicantForCredentialEmail(email.toLowerCase());
          if (!applicant || !applicantAccessEnabled(applicant)) return null;

          const user =
            (await db.select().from(users).where(eq(users.id, applicant.id)).limit(1))[0] ??
            (await findUserByAnyEmail(applicant.email.toLowerCase()));
          if (!user?.isActive) return null;

          const valid = await bcrypt.compare(password, user.password);
          if (!valid) return null;

          db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id)).catch((err: unknown) => {
            console.warn("[auth] last_login_at update skipped (column may not exist yet):", (err as Error).message);
          });

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            profilePictureUrl: user.profilePictureUrl ?? null,
            role: normalizeRole(user.role),
            teamId: user.teamId,
            isActive: Boolean(user.isActive),
            applicantStatus: normalizeApplicantStatus(user.status),
            chronosUserId: user.id,
          };
        } catch {
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user) {
        const t = token as Record<string, unknown>;
        t.id = user.id;
        t.role = (user as { role?: Role }).role ?? "member";
        t.teamId = (user as { teamId?: string | null }).teamId ?? null;
        t.isActive = (user as { isActive?: boolean }).isActive ?? true;
        t.profilePictureUrl = (user as { profilePictureUrl?: string | null }).profilePictureUrl ?? null;
        t.applicantStatus = (user as { applicantStatus?: ApplicantStatus | null }).applicantStatus ?? null;
        t.chronosUserId = (user as { chronosUserId?: string | null }).chronosUserId ?? null;
        t.roleRefreshedAt = Date.now();
      }

      const t = token as Record<string, unknown>;
      const applicantId = t.id as string | undefined;
      const chronosFromToken = t.chronosUserId as string | undefined;
      const lastRefresh = (t.roleRefreshedAt as number | undefined) ?? 0;
      const REFRESH_INTERVAL_MS = 30_000;

      if (applicantId && (trigger === "update" || Date.now() - lastRefresh > REFRESH_INTERVAL_MS)) {
        try {
          const { db } = await import("./db");
          const { users } = await import("./db/schema");
          const { eq } = await import("drizzle-orm");

          if (db) {
            type FreshRow = {
              id: string;
              role: string | null;
              teamId: string | null;
              isActive: boolean;
              profilePictureUrl: string | null;
              status: string | null;
            };

            const selectCols = {
              id: users.id,
              role: users.role,
              teamId: users.teamId,
              isActive: users.isActive,
              profilePictureUrl: users.profilePictureUrl,
              status: users.status,
            };

            let fresh: FreshRow | undefined;
            const [byPk] = await db.select(selectCols).from(users).where(eq(users.id, applicantId)).limit(1);
            fresh = byPk;

            if (!fresh && chronosFromToken) {
              const [byChronos] = await db.select(selectCols).from(users).where(eq(users.id, chronosFromToken)).limit(1);
              fresh = byChronos;
            }

            if (fresh) {
              t.id = fresh.id;
              t.role = normalizeRole(fresh.role);
              t.teamId = fresh.teamId ?? null;
              t.isActive = fresh.isActive;
              t.profilePictureUrl = fresh.profilePictureUrl ?? null;
              t.applicantStatus = normalizeApplicantStatus(fresh.status);
              t.chronosUserId = fresh.id;
              t.roleRefreshedAt = Date.now();

              if (!applicantAccessEnabled({ status: fresh.status, isActive: fresh.isActive })) {
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
      session.user.profilePictureUrl = (t.profilePictureUrl as string | null | undefined) ?? null;
      session.user.applicantStatus = (t.applicantStatus as ApplicantStatus | null | undefined) ?? null;
      session.user.chronosUserId = (t.chronosUserId as string | null | undefined) ?? null;
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
      applicantStatus?: ApplicantStatus | null;
      chronosUserId?: string | null;
    };
  }
}
