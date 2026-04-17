import { SessionProvider } from "next-auth/react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { auth } from "@/lib/auth";
import { TimerProvider } from "@/hooks/use-timer";
import { redirect } from "next/navigation";
import { markUserWebsiteVisit } from "@/lib/user-activity";

export default async function Layout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  try {
    await markUserWebsiteVisit(session.user.id, session.user.email);
  } catch (error) {
    console.error('[dashboard/layout] markUserWebsiteVisit failed', error);
  }

  return (
    <SessionProvider session={session}>
      <TimerProvider userId={session.user.id}>
        <DashboardLayout>{children}</DashboardLayout>
      </TimerProvider>
    </SessionProvider>
  );
}
