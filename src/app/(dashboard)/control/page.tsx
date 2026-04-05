import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/permissions";
import { ControlForm } from "./ControlForm";

export const metadata: Metadata = { title: "Control | FloLabs Chronos" };

export default async function ControlPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!isAdmin(session.user)) redirect("/timer");

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-light italic text-on-background" style={{ fontFamily: "var(--font-newsreader, 'Newsreader'), serif" }}>
          Control
        </h1>
        <p className="text-sm text-on-surface-variant mt-0.5" style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}>
          Admin-only operational control for Notion integration settings.
        </p>
      </div>
      <ControlForm />
    </div>
  );
}
