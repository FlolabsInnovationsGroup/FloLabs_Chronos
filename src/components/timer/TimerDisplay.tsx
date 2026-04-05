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
        className="text-sm font-medium uppercase tracking-widest text-tertiary"
        style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
      >
        {activeTimer ? "Current Focus" : "Ready to Focus"}
      </p>

      {/* Giant time display */}
      <div className="flex w-full min-w-0 items-baseline gap-0 leading-none">
        <span
          className="block w-full min-w-0 text-5xl xs:text-6xl sm:text-7xl md:text-8xl font-light italic text-on-background tabular-nums tracking-tight select-none"
          style={{ fontFamily: "var(--font-newsreader, 'Newsreader'), serif" }}
        >
          {display}
        </span>
      </div>

    </div>
  );
}
