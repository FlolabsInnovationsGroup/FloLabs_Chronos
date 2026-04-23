import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { SettingsForm } from "./SettingsForm";
import { db } from "@/lib/db";
import { applicants, userEmailAliases } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { chronosUserIdFromSessionUser } from "@/lib/chronos-session";

export const metadata: Metadata = { title: "Settings | FloLabs Chronos" };

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const chronosUserId = chronosUserIdFromSessionUser(session.user);
  if (!chronosUserId) redirect("/login");

  const [aliases, linkedApplicant] = db
    ? await Promise.all([
        db
          .select({ email: userEmailAliases.email })
          .from(userEmailAliases)
          .where(eq(userEmailAliases.userId, chronosUserId)),
        db
          .select({
            name: applicants.name,
            email: applicants.email,
            profilePictureUrl: applicants.profilePictureUrl,
          })
          .from(applicants)
          .where(eq(applicants.chronosUserId, chronosUserId))
          .limit(1)
          .then((rows) => rows[0] ?? null),
      ])
    : [[], null as { name: string; email: string; profilePictureUrl: string | null } | null];
  const alternateEmails = Array.from(
    new Set([(linkedApplicant?.email ?? session.user.email).toLowerCase(), ...aliases.map((row) => row.email.toLowerCase())]),
  );

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-6">
      <div>
        <h1
          className="text-2xl font-light italic text-on-background"
          style={{ fontFamily: "var(--font-newsreader, 'Newsreader'), serif" }}
        >
          Settings
        </h1>
        <p
          className="text-sm text-on-surface-variant mt-0.5"
          style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
        >
          Manage your account
        </p>
      </div>

      <SettingsForm
        user={{
          id: chronosUserId,
          name: linkedApplicant?.name?.trim() || session.user.name,
          email: linkedApplicant?.email?.trim() || session.user.email,
          alternateEmails,
          profilePictureUrl: linkedApplicant?.profilePictureUrl ?? session.user.profilePictureUrl ?? null,
        }}
      />
    </div>
  );
}
