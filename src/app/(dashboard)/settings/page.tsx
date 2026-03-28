import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { SettingsForm } from "./SettingsForm";

export const metadata: Metadata = { title: "Settings | FloLabs Chronos" };

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-6">
      <div>
        <h1
          className="text-2xl font-light italic text-[#31332f]"
          style={{ fontFamily: "var(--font-newsreader, 'Newsreader'), serif" }}
        >
          Settings
        </h1>
        <p
          className="text-sm text-[#5e605b] mt-0.5"
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
        }}
      />
    </div>
  );
}
