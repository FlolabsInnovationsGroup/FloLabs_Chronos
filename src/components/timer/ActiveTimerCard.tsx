"use client";

import { useTimer } from "@/hooks/use-timer";
import { Card } from "@/components/ui/Card";
import type { TimeEntry } from "@/types";

interface ActiveTimerCardProps {
  todayEntries?: TimeEntry[];
  targetHours?: number;
}

export function ActiveTimerCard({ todayEntries = [], targetHours = 8 }: ActiveTimerCardProps) {
  const { activeTimer, elapsed } = useTimer();

  // Total ms logged today from completed entries
  const completedMs = todayEntries.reduce((sum, e) => sum + (e.durationMs ?? 0), 0);
  // Add current session elapsed time
  const totalMsToday = completedMs + (activeTimer ? elapsed : 0);

  const totalHours = totalMsToday / 3_600_000;
  const targetMs = targetHours * 3_600_000;
  const progressPct = Math.min(100, (totalMsToday / targetMs) * 100);

  // Format hours display
  const hoursInt = Math.floor(totalHours);
  const minutesInt = Math.floor((totalHours - hoursInt) * 60);

  // Active project name
  const activeProjectName =
    activeTimer
      ? todayEntries.find((e) => e.projectId === activeTimer.projectId)?.project?.name ??
        "No project"
      : null;
  const sessionCount = todayEntries.length + (activeTimer ? 1 : 0);

  return (
    <Card className="p-6 flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2
          className="text-base font-semibold text-[#31332f]"
          style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
        >
          Daily Momentum
        </h2>
        {activeTimer && (
          <span className="flex items-center gap-1.5 rounded-full bg-[#fde0d9] px-2.5 py-1 text-xs font-medium text-[#791903]">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#a73b21] opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#a73b21]" />
            </span>
            Live
          </span>
        )}
      </div>

      {/* Hours logged */}
      <div className="flex flex-col gap-1">
        <p
          className="text-xs uppercase tracking-widest text-[#755a40] font-medium"
          style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
        >
          Hours logged today
        </p>
        <div className="flex items-baseline gap-1.5">
          <span
            className="text-5xl font-light italic text-[#31332f] tabular-nums"
            style={{ fontFamily: "var(--font-newsreader, 'Newsreader'), serif" }}
          >
            {hoursInt}
            <span className="text-2xl text-[#5e605b]">h {minutesInt}m</span>
          </span>
          <span
            className="text-sm text-[#b2b2ad] ml-1"
            style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
          >
            / {targetHours}h target
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="flex flex-col gap-2">
        <div className="w-full h-2 bg-[#f5f4ef] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-1000"
            style={{
              width: `${progressPct}%`,
              backgroundColor: progressPct >= 100 ? "#366769" : "#abdddf",
            }}
          />
        </div>
        <p
          className="text-xs text-[#5e605b]"
          style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
        >
          {progressPct >= 100
            ? "Target reached!"
            : `${Math.round(progressPct)}% of daily target`}
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-[#f5f4ef] rounded-xl p-3.5 flex flex-col gap-1">
          <p
            className="text-xs text-[#5e605b] uppercase tracking-wide font-medium"
            style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
          >
            Sessions
          </p>
          <p
            className="text-2xl font-light italic text-[#31332f] tabular-nums"
            style={{ fontFamily: "var(--font-newsreader, 'Newsreader'), serif" }}
          >
            {sessionCount}
          </p>
        </div>

        <div className="bg-[#f5f4ef] rounded-xl p-3.5 flex flex-col gap-1">
          <p
            className="text-xs text-[#5e605b] uppercase tracking-wide font-medium"
            style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
          >
            {activeTimer ? "Active Project" : "Last Project"}
          </p>
          <p
            className="text-sm font-medium text-[#31332f] truncate mt-1"
            style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
            title={activeProjectName ?? todayEntries[0]?.project?.name ?? "None"}
          >
            {activeProjectName ?? todayEntries[0]?.project?.name ?? "None"}
          </p>
        </div>
      </div>
    </Card>
  );
}
