import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import bcrypt from "bcryptjs";
import type { ApplicantProgramStatus, Role } from "@/types";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function normalizeApplicantStatus(input: string | null | undefined): ApplicantProgramStatus | null {
  const value = String(input ?? "").trim().toLowerCase();
  if (value === "active") return "active";
  if (value === "graduated") return "graduated";
  if (value === "terminated") return "terminated";
  return null;
}

function applicantAccessEnabled(input: { stage?: string | null; status?: string | null; isActive?: boolean | null }) {
  const stage = String(input.stage ?? "").trim().toLowerCase();
  const status = String(input.status ?? "").trim().toLowerCase();
  return Boolean(input.isActive) && status !== "terminated" && (stage === "joined" || status === "joined" || status === "active" || status === "signed");
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

          let user =
            applicant.chronosUserId
              ? (await db.select().from(users).where(eq(users.id, applicant.chronosUserId)).limit(1))[0]
              : undefined;
          if (!user) {
            const byEmail = await findUserByAnyEmail(applicant.email.toLowerCase());
            if (byEmail) user = byEmail;
          }
          if (!user?.isActive) return null;

          const valid = await bcrypt.compare(password, user.password);
          if (!valid) return null;

          return {
            id: applicant.id,
            email: applicant.email,
            name: applicant.name,
            profilePictureUrl: applicant.profilePictureUrl ?? user.profilePictureUrl ?? null,
            role: normalizeRole(applicant.role ?? user.role),
            teamId: applicant.teamId ?? user.teamId,
            isActive: Boolean(applicant.isActive),
            applicantStatus: normalizeApplicantStatus(applicant.status),
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
        t.applicantStatus = (user as { applicantStatus?: ApplicantProgramStatus | null }).applicantStatus ?? null;
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
          const { applicants, users } = await import("./db/schema");
          const { eq } = await import("drizzle-orm");

          if (db) {
            type FreshRow = {
              id: string;
              role: string | null;
              teamId: string | null;
              isActive: boolean;
              profilePictureUrl: string | null;
              status: string | null;
              chronosUserId: string | null;
            };

            let fresh: FreshRow | undefined;
            const [byPk] = await db
              .select({
                id: applicants.id,
                role: applicants.role,
                teamId: applicants.teamId,
                isActive: applicants.isActive,
                profilePictureUrl: applicants.profilePictureUrl,
                status: applicants.status,
                chronosUserId: applicants.chronosUserId,
              })
              .from(applicants)
              .where(eq(applicants.id, applicantId))
              .limit(1);
            fresh = byPk;

            if (!fresh && chronosFromToken) {
              const [byChronos] = await db
                .select({
                  id: applicants.id,
                  role: applicants.role,
                  teamId: applicants.teamId,
                  isActive: applicants.isActive,
                  profilePictureUrl: applicants.profilePictureUrl,
                  status: applicants.status,
                  chronosUserId: applicants.chronosUserId,
                })
                .from(applicants)
                .where(eq(applicants.chronosUserId, chronosFromToken))
                .limit(1);
              fresh = byChronos;
            }

            if (!fresh && !chronosFromToken) {
              const [legacy] = await db
                .select({
                  id: applicants.id,
                  role: applicants.role,
                  teamId: applicants.teamId,
                  isActive: applicants.isActive,
                  profilePictureUrl: applicants.profilePictureUrl,
                  status: applicants.status,
                  chronosUserId: applicants.chronosUserId,
                })
                .from(applicants)
                .where(eq(applicants.chronosUserId, applicantId))
                .limit(1);
              fresh = legacy;
            }

            if (fresh) {
              t.id = fresh.id;
              t.role = normalizeRole(fresh.role);
              t.teamId = fresh.teamId ?? null;
              t.isActive = fresh.isActive;
              t.profilePictureUrl = fresh.profilePictureUrl ?? null;
              t.applicantStatus = normalizeApplicantStatus(fresh.status);
              t.chronosUserId = fresh.chronosUserId ?? chronosFromToken ?? null;
              t.roleRefreshedAt = Date.now();

              if (!applicantAccessEnabled({ status: fresh.status, isActive: fresh.isActive })) {
                return null as unknown as typeof token;
              }
            } else {
              const legacyUserId = chronosFromToken ?? applicantId;
              if (legacyUserId) {
                const [legacy] = await db
                  .select({
                    role: users.role,
                    teamId: users.teamId,
                    isActive: users.isActive,
                    profilePictureUrl: users.profilePictureUrl,
                  })
                  .from(users)
                  .where(eq(users.id, legacyUserId))
                  .limit(1);
                if (legacy) {
                  t.role = normalizeRole(legacy.role);
                  t.teamId = legacy.teamId ?? null;
                  t.isActive = legacy.isActive;
                  t.profilePictureUrl = legacy.profilePictureUrl ?? null;
                  t.chronosUserId = legacyUserId;
                  t.roleRefreshedAt = Date.now();
                }
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
      session.user.applicantStatus = (t.applicantStatus as ApplicantProgramStatus | null | undefined) ?? null;
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
      applicantStatus?: ApplicantProgramStatus | null;
      chronosUserId?: string | null;
    };
  }
}
