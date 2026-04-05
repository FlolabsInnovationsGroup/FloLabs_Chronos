"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { cn } from "@/lib/utils";
import { useTimer } from "@/hooks/use-timer";
import { TimerActionIndicator } from "@/components/timer/TimerActionIndicator";
import { Tooltip } from "@/components/ui/Tooltip";
import { getTimerStopValidation } from "@/lib/timer-rules";
import { FlolabsMark } from "@/components/brand/FlolabsMark";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

const NAV_LINKS = [
  { href: "/timer", label: "Dashboard" },
  { href: "/reports", label: "Reports" },
];

interface TopBarProps {
  mobileNavOpen?: boolean;
  onToggleMobileNav?: () => void;
}

export function TopBar({ mobileNavOpen = false, onToggleMobileNav }: TopBarProps) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { activeTimer, start, stop, loading } = useTimer();

  const initial = session?.user?.name ? session.user.name.charAt(0).toUpperCase() : "?";
  const stopValidation = getTimerStopValidation(activeTimer);
  const canStop = !!activeTimer && stopValidation.canStop;
  const timerActionLabel = !activeTimer
    ? "Start timer"
    : canStop
      ? "Stop timer"
      : stopValidation.message;
  const mobileNavLabel = mobileNavOpen ? "Hide navigation" : "Show navigation";

  async function handleTimerAction() {
    if (loading) return;

    if (!activeTimer) {
      await start({ projectId: null, description: "", tagIds: [] }).catch(() => {});
      return;
    }

    if (!canStop) return;
    await stop(false).catch(() => {});
  }

  const actionButton = (
    <button
      type="button"
      onClick={() => void handleTimerAction()}
      disabled={loading || (!!activeTimer && !canStop)}
      aria-label={timerActionLabel}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-full transition-colors",
        !activeTimer && "bg-primary text-on-primary hover:bg-primary-dim",
        canStop && "bg-error text-on-chrome hover:bg-error-dim",
        activeTimer && !canStop && "bg-surface-container-high text-disabled-on cursor-not-allowed"
      )}
    >
      <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>
        {!activeTimer ? "play_arrow" : "stop"}
      </span>
    </button>
  );

  return (
    <header className="sticky top-0 z-[70] bg-background/90 backdrop-blur-md">
      <div className="flex h-14 items-center justify-between px-3 sm:px-4 md:px-6">
        <div className="md:hidden">
          <button
            type="button"
            onClick={onToggleMobileNav}
            aria-label={mobileNavLabel}
            aria-controls="mobile-navigation"
            aria-expanded={mobileNavOpen}
            className={cn(
              "inline-flex items-center gap-2 rounded-full border border-surface-container-highest bg-surface-container-lowest py-1.5 pl-2 pr-3 text-on-surface-variant transition-colors",
              mobileNavOpen ? "bg-surface-container-low text-on-background" : "hover:bg-surface-container-low hover:text-on-background"
            )}
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-container-low">
              <FlolabsMark className="h-6 w-6" />
            </span>
            <span
              className="text-[11px] font-semibold uppercase tracking-[0.18em]"
              style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
            >
              Menu
            </span>
            <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>
              {mobileNavOpen ? "close" : "menu"}
            </span>
          </button>
        </div>

        <div className="hidden md:block" />

        <div className="flex items-center gap-4">
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
                      ? "bg-surface-container-high text-on-background"
                      : "text-on-surface-variant hover:text-on-background hover:bg-surface-container-low"
                  )}
                  style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>

          <div className="hidden md:flex items-center gap-2">
            <TimerActionIndicator compact />
            <ThemeToggle />
          </div>

          <div className="md:hidden">
            <ThemeToggle />
          </div>

          <Tooltip label={timerActionLabel} delayMs={300}>
            {actionButton}
          </Tooltip>

          <div
            className="w-8 h-8 rounded-full bg-primary text-on-primary flex items-center justify-center text-sm font-semibold cursor-pointer select-none"
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
