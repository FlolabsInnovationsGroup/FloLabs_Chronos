"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { FlolabsMark } from "@/components/brand/FlolabsMark";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  icon: string;
  label: string;
}

interface SidebarProps {
  mobile?: boolean;
  open?: boolean;
  onClose?: () => void;
}

const BASE_NAV_ITEMS: NavItem[] = [
  { href: "/timer", icon: "schedule", label: "Timer" },
  { href: "/projects", icon: "folder", label: "Projects" },
  { href: "/tags", icon: "label", label: "Tags" },
  { href: "/teams", icon: "groups", label: "Teams" },
  { href: "/team", icon: "group", label: "Users" },
  { href: "/reports", icon: "bar_chart", label: "Reports" },
];

function SidebarLink(params: {
  item: NavItem;
  pathname: string;
  mobile?: boolean;
  onNavigate?: () => void;
}) {
  const { item, pathname, mobile = false, onNavigate } = params;
  const isActive = pathname === item.href || pathname.startsWith(item.href + "/");

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={isActive ? "page" : undefined}
      title={mobile ? undefined : item.label}
      className={cn(
        mobile
          ? "w-full flex items-center gap-3 rounded-2xl px-4 py-3 text-sm transition-colors"
          : "w-full flex flex-col items-center gap-1 rounded-xl px-1 py-2.5 transition-colors group",
        isActive
          ? "bg-surface-container-high text-primary"
          : "text-on-secondary-fixed-variant hover:text-primary hover:bg-surface-container-low"
      )}
    >
      <span
        className="material-symbols-outlined shrink-0"
        style={{
          fontSize: mobile ? "20px" : "22px",
          fontVariationSettings: isActive
            ? '"FILL" 1, "wght" 400, "GRAD" 0, "opsz" 24'
            : '"FILL" 0, "wght" 400, "GRAD" 0, "opsz" 24',
        }}
      >
        {item.icon}
      </span>
      <span
        className={cn(
          mobile ? "text-sm font-medium leading-tight" : "text-[10px] font-medium leading-none"
        )}
        style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
      >
        {item.label}
      </span>
    </Link>
  );
}

function SettingsLink(params: {
  pathname: string;
  mobile?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <SidebarLink
      item={{ href: "/settings", icon: "settings", label: "Settings" }}
      pathname={params.pathname}
      mobile={params.mobile}
      onNavigate={params.onNavigate}
    />
  );
}

export function Sidebar({ mobile = false, open = false, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const role = session?.user.role;
  const MEMBER_HIDDEN = new Set(["/team", "/projects", "/control"]);
  const navItems = [
    ...BASE_NAV_ITEMS.filter((item) => !(role === "member" && MEMBER_HIDDEN.has(item.href))),
    ...(role === "admin" || role === "hr" ? [{ href: "/control", icon: "tune", label: "Control" }] : []),
  ];

  if (mobile) {
    return (
      <div
        className={cn(
          "md:hidden fixed inset-x-0 top-14 bottom-0 z-[60] transition-[visibility] duration-200",
          open ? "visible" : "invisible pointer-events-none"
        )}
      >
        <button
          type="button"
          aria-label="Close navigation"
          onClick={onClose}
          className={cn(
            "absolute inset-0 bg-chrome/18 backdrop-blur-[2px] transition-opacity duration-200",
            open ? "opacity-100" : "opacity-0"
          )}
        />

        <aside
          id="mobile-navigation"
          aria-label="Main navigation"
          className={cn(
            "relative flex h-full w-[min(18rem,calc(100vw-1rem))] max-w-full flex-col border-r border-surface-container bg-surface-container-lowest paper-shadow px-3 py-4 transition-transform duration-200 ease-out",
            open ? "translate-x-0" : "-translate-x-full"
          )}
        >
          <div className="px-2 pb-3">
            <p
              className="text-[11px] uppercase tracking-[0.18em] text-label-muted"
              style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
            >
              Navigation
            </p>
            <p
              className="mt-1 text-sm text-on-surface-variant"
              style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
            >
              FloLabs Chronos
            </p>
          </div>

          <nav className="flex flex-1 flex-col gap-1 overflow-y-auto pr-1">
            {navItems.map((item) => (
              <SidebarLink
                key={item.href}
                item={item}
                pathname={pathname}
                mobile
                onNavigate={onClose}
              />
            ))}
          </nav>

          <div className="mt-4 border-t border-surface-container pt-3">
            <SettingsLink pathname={pathname} mobile onNavigate={onClose} />
          </div>
        </aside>
      </div>
    );
  }

  return (
    <aside
      className="fixed left-0 top-0 h-full w-20 bg-surface-container-lowest paper-shadow z-40 flex flex-col items-center py-5 gap-2"
      aria-label="Main navigation"
    >
      <Link
        href="/timer"
        className="w-14 h-14 flex items-center justify-center rounded-xl mb-3 hover:bg-surface-container-low transition-colors"
        aria-label="FloLabs Chronos home"
      >
        <FlolabsMark className="h-11 w-11" />
      </Link>

      <nav className="flex flex-col items-center gap-1 flex-1 w-full px-2">
        {navItems.map((item) => (
          <SidebarLink key={item.href} item={item} pathname={pathname} />
        ))}
      </nav>

      <div className="w-full px-2">
        <SettingsLink pathname={pathname} />
      </div>
    </aside>
  );
}
