import { SessionProvider } from "next-auth/react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { auth } from "@/lib/auth";
import { TimerProvider } from "@/hooks/use-timer";
import { redirect } from "next/navigation";
import { markUserWebsiteVisit } from "@/lib/user-activity";
import { applicantIdForSessionLinkedUser, chronosUserIdFromSessionUser } from "@/lib/chronos-session";

export default async function Layout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  const chronosUserId = chronosUserIdFromSessionUser(session.user);
  if (!chronosUserId) {
    redirect("/login");
  }
  const applicantId = applicantIdForSessionLinkedUser(session.user);
  try {
    await markUserWebsiteVisit(chronosUserId, session.user.email, applicantId);
  } catch (error) {
    console.error('[dashboard/layout] markUserWebsiteVisit failed', error);
  }

  return (
    <SessionProvider session={session}>
      <TimerProvider userId={chronosUserId}>
        <DashboardLayout>{children}</DashboardLayout>
      </TimerProvider>
    </SessionProvider>
  );
}
