"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { cn } from "@/lib/utils";
import { useTimer } from "@/hooks/use-timer";
import { Tooltip } from "@/components/ui/Tooltip";
import { getTimerStopValidation } from "@/lib/timer-rules";

const NAV_LINKS = [
  { href: "/timer", label: "Dashboard" },
  { href: "/reports", label: "Reports" },
];

export function TopBar() {
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
        !activeTimer && "bg-[#366769] text-[#e3feff] hover:bg-[#295a5d]",
        canStop && "bg-[#a73b21] text-[#fff7f6] hover:bg-[#791903]",
        activeTimer && !canStop && "bg-[#e9e8e3] text-[#a7a79f] cursor-not-allowed"
      )}
    >
      <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>
        {!activeTimer ? "play_arrow" : "stop"}
      </span>
    </button>
  );

  return (
    <header className="sticky top-0 z-30 bg-[#fbf9f5]/90 backdrop-blur-md">
      <div className="flex items-center justify-between px-6 h-14">
        <div />

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

          <Tooltip label={timerActionLabel} delayMs={300}>
            {actionButton}
          </Tooltip>

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
