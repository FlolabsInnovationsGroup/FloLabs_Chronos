import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { SettingsForm } from "./SettingsForm";
import { db } from "@/lib/db";
import { userEmailAliases } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const metadata: Metadata = { title: "Settings | FloLabs Chronos" };

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const aliases =
    db
      ? await db
          .select({ email: userEmailAliases.email })
          .from(userEmailAliases)
          .where(eq(userEmailAliases.userId, session.user.id))
      : [];
  const alternateEmails = Array.from(
    new Set([session.user.email.toLowerCase(), ...aliases.map((row) => row.email.toLowerCase())]),
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
          id: session.user.id,
          name: session.user.name,
          email: session.user.email,
          alternateEmails,
          profilePictureUrl: session.user.profilePictureUrl ?? null,
        }}
      />
    </div>
  );
}
