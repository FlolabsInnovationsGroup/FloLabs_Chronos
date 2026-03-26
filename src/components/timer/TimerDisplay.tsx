"use client";

import { useTimer } from "@/hooks/use-timer";
import { formatDuration } from "@/lib/utils";

export function TimerDisplay() {
  const { elapsed, activeTimer } = useTimer();

  const display = formatDuration(elapsed);

  return (
    <div className="flex flex-col gap-2">
      {/* Label */}
      <p
        className="text-sm font-medium uppercase tracking-widest text-[#755a40]"
        style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
      >
        {activeTimer ? "Current Focus" : "Ready to Focus"}
      </p>

      {/* Giant time display */}
      <div className="flex items-baseline gap-0 leading-none">
        <span
          className="text-7xl md:text-8xl font-light italic text-[#31332f] tabular-nums tracking-tight select-none"
          style={{ fontFamily: "var(--font-newsreader, 'Newsreader'), serif" }}
        >
          {display}
        </span>
      </div>

      {/* Project/description hint when active */}
      {activeTimer?.description && (
        <p
          className="text-base italic text-[#5e605b] mt-1 truncate max-w-sm"
          style={{ fontFamily: "var(--font-newsreader, 'Newsreader'), serif" }}
        >
          {activeTimer.description}
        </p>
      )}
    </div>
  );
}
