"use client";

import React, { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { BottomNav } from "./BottomNav";

/** Re-validate the session from the server every 30 seconds so role/isActive changes take effect promptly. */
const SESSION_REFRESH_MS = 30_000;

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, update: updateSession } = useSession();
  const [mobileNavPath, setMobileNavPath] = useState<string | null>(null);

  // Periodically refresh the session so role changes made by admins
  // take effect without requiring the user to sign out and back in.
  useEffect(() => {
    const id = setInterval(() => {
      void updateSession();
    }, SESSION_REFRESH_MS);
    return () => clearInterval(id);
  }, [updateSession]);

  // When the session updates and the user becomes inactive, sign them out.
  useEffect(() => {
    if (session && session.user.isActive === false) {
      router.push("/login");
    }
  }, [session, router]);
  const mobileNavOpen = mobileNavPath === pathname;

  useEffect(() => {
    if (!mobileNavOpen) {
      document.body.style.overflow = "";
      return;
    }

    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileNavOpen]);

  // Keep applicant "recently visited" in sync on every route change.
  useEffect(() => {
    if (!session?.user) return;
    const controller = new AbortController();
    void fetch("/api/user-activity/visit", {
      method: "POST",
      cache: "no-store",
      signal: controller.signal,
      keepalive: true,
    }).catch(() => null);
    return () => controller.abort();
  }, [pathname, session?.user?.id]);

  return (
    <div className="min-h-screen bg-background">
      {/* Fixed left sidebar — hidden on mobile */}
      <div className="hidden md:block">
        <Sidebar />
      </div>

      {/* Main content area, offset by sidebar width on md+ */}
      <div className="md:ml-20 flex flex-col min-h-screen">
        <TopBar
          mobileNavOpen={mobileNavOpen}
          onToggleMobileNav={() =>
            setMobileNavPath((current) => (current === pathname ? null : pathname))
          }
        />
        <Sidebar mobile open={mobileNavOpen} onClose={() => setMobileNavPath(null)} />
        <main className="flex-1 px-4 md:px-8 py-6">{children}</main>
      </div>

      {/* Mobile bottom nav */}
      <BottomNav />
    </div>
  );
}
