"use client";

import React, { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { BottomNav } from "./BottomNav";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const pathname = usePathname();
  const [mobileNavPath, setMobileNavPath] = useState<string | null>(null);
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
