"use client";

import { useTimer } from "@/hooks/use-timer";
import { Card } from "@/components/ui/Card";
import type { TimeEntry } from "@/types";

interface ActiveTimerCardProps {
  weekEntries?: TimeEntry[];
  weeklyTargetHours?: number;
}

export function ActiveTimerCard({ weekEntries = [], weeklyTargetHours = 40 }: ActiveTimerCardProps) {
  const { activeTimer, elapsed } = useTimer();

  const completedMs = weekEntries.reduce((sum, e) => sum + (e.durationMs ?? 0), 0);
  const totalMsWeek = completedMs + (activeTimer ? elapsed : 0);

  const totalHours = totalMsWeek / 3_600_000;
  const targetMs = weeklyTargetHours * 3_600_000;
  const progressPct = Math.min(100, (totalMsWeek / targetMs) * 100);

  // Format hours display
  const hoursInt = Math.floor(totalHours);
  const minutesInt = Math.floor((totalHours - hoursInt) * 60);

  // Active project name
  const activeProjectName =
    activeTimer
      ? (activeTimer.projectName ?? "No project")
      : null;
  const sessionCount = weekEntries.length + (activeTimer ? 1 : 0);

  return (
    <Card className="min-w-0 p-4 sm:p-6 flex flex-col gap-5 sm:gap-6 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2
          className="text-base font-semibold text-on-background"
          style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
        >
          Weekly Momentum
        </h2>
        {activeTimer && (
          <span className="flex items-center gap-1.5 rounded-full bg-warm-muted px-2.5 py-1 text-xs font-medium text-error-dim">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-error opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-error" />
            </span>
            Live
          </span>
        )}
      </div>

      {/* Hours logged */}
      <div className="flex flex-col gap-1">
        <p
          className="text-xs uppercase tracking-widest text-tertiary font-medium"
          style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
        >
          Hours logged this week
        </p>
        <div className="flex flex-wrap items-baseline gap-1.5 min-w-0">
          <span
            className="text-4xl sm:text-5xl font-light italic text-on-background tabular-nums break-words"
            style={{ fontFamily: "var(--font-newsreader, 'Newsreader'), serif" }}
          >
            {hoursInt}
            <span className="text-2xl text-on-surface-variant">h {minutesInt}m</span>
          </span>
          <span
            className="text-sm text-outline-variant ml-0 sm:ml-1"
            style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
          >
            / {weeklyTargetHours}h target
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="flex flex-col gap-2">
        <div className="w-full h-2 bg-surface-container-low rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-1000"
            style={{
              width: `${progressPct}%`,
              backgroundColor: progressPct >= 100 ? "var(--c-primary)" : "var(--c-primary-fixed-dim)",
            }}
          />
        </div>
        <p
          className="text-xs text-on-surface-variant"
          style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
        >
          {progressPct >= 100
            ? "Target reached!"
            : `${Math.round(progressPct)}% of weekly target`}
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-surface-container-low rounded-xl p-3.5 flex flex-col gap-1">
          <p
            className="text-xs text-on-surface-variant uppercase tracking-wide font-medium"
            style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
          >
            Sessions
          </p>
          <p
            className="text-2xl font-light italic text-on-background tabular-nums"
            style={{ fontFamily: "var(--font-newsreader, 'Newsreader'), serif" }}
          >
            {sessionCount}
          </p>
        </div>

        <div className="bg-surface-container-low rounded-xl p-3.5 flex flex-col gap-1">
          <p
            className="text-xs text-on-surface-variant uppercase tracking-wide font-medium"
            style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
          >
            {activeTimer ? "Active Project" : "Last Project"}
          </p>
          <p
            className="text-sm font-medium text-on-background truncate mt-1"
            style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
            title={activeProjectName ?? weekEntries[0]?.project?.name ?? "None"}
          >
            {activeProjectName ?? weekEntries[0]?.project?.name ?? "None"}
          </p>
        </div>
      </div>
    </Card>
  );
}
