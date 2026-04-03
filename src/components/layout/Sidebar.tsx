"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import floLabsLogo from "../../../assets/logo/FLChron_logo_512px.png";

interface NavItem {
  href: string;
  icon: string;
  label: string;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/timer", icon: "schedule", label: "Timer" },
  { href: "/projects", icon: "folder", label: "Projects" },
  { href: "/tags", icon: "label", label: "Tags" },
  { href: "/team", icon: "group", label: "Users" },
  { href: "/reports", icon: "bar_chart", label: "Reports" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      className="fixed left-0 top-0 h-full w-20 bg-surface-container-lowest paper-shadow z-40 flex flex-col items-center py-5 gap-2"
      aria-label="Main navigation"
    >
      {/* Logo */}
      <Link
        href="/timer"
        className="w-14 h-14 flex items-center justify-center rounded-xl mb-3 hover:bg-[#f5f4ef] transition-colors"
        aria-label="FloLabs Chronos home"
      >
        <Image
          src={floLabsLogo}
          alt="FloLabs Chronos"
          priority
          className="h-11 w-11 object-contain"
        />
      </Link>

      {/* Nav items */}
      <nav className="flex flex-col items-center gap-1 flex-1 w-full px-2">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              className={cn(
                "w-full flex flex-col items-center gap-1 py-2.5 px-1 rounded-xl transition-colors group",
                isActive
                  ? "bg-[#e9e8e3] text-[#366769]"
                  : "text-[#595a6b] hover:text-[#366769] hover:bg-[#f5f4ef]"
              )}
            >
              <span
                className="material-symbols-outlined"
                style={{
                  fontSize: "22px",
                  fontVariationSettings: isActive
                    ? '"FILL" 1, "wght" 400, "GRAD" 0, "opsz" 24'
                    : '"FILL" 0, "wght" 400, "GRAD" 0, "opsz" 24',
                }}
              >
                {item.icon}
              </span>
              <span
                className="text-[10px] font-medium leading-none"
                style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Settings at bottom */}
      <Link
        href="/settings"
        title="Settings"
        className="flex flex-col items-center gap-1 py-2.5 px-1 rounded-xl text-[#595a6b] hover:text-[#366769] hover:bg-[#f5f4ef] transition-colors w-full mx-2"
      >
        <span className="material-symbols-outlined" style={{ fontSize: "22px" }}>
          settings
        </span>
        <span
          className="text-[10px] font-medium leading-none"
          style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
        >
          Settings
        </span>
      </Link>
    </aside>
  );
}
