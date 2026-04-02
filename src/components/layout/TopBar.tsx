"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { href: "/timer", label: "Dashboard" },
  { href: "/reports", label: "Reports" },
];

export function TopBar() {
  const pathname = usePathname();
  const { data: session } = useSession();

  const initial = session?.user?.name
    ? session.user.name.charAt(0).toUpperCase()
    : "?";

  return (
    <header className="sticky top-0 z-30 bg-[#fbf9f5]/90 backdrop-blur-md">
      <div className="flex items-center justify-between px-6 h-14">
        {/* Brand */}
        <span
          className="text-xl font-semibold italic text-[#31332f] select-none"
          style={{ fontFamily: "var(--font-newsreader, 'Newsreader'), serif" }}
        >
          FloLabs Chronos
        </span>

        {/* Right side */}
        <div className="flex items-center gap-4">
          {/* Nav links */}
          <nav className="hidden md:flex items-center gap-1">
            {NAV_LINKS.map((link) => {
              const isActive =
                pathname === link.href || (link.href !== "/timer" && pathname.startsWith(link.href));
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                    isActive
                      ? "bg-[#e9e8e3] text-[#31332f]"
                      : "text-[#5e605b] hover:text-[#31332f] hover:bg-[#f5f4ef]"
                  )}
                  style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>

          {/* User avatar */}
          <div
            className="w-8 h-8 rounded-full bg-[#366769] text-[#e3feff] flex items-center justify-center text-sm font-semibold cursor-pointer select-none"
            title={session?.user?.name ?? "User"}
            style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
          >
            {initial}
          </div>
        </div>
      </div>
    </header>
  );
}
