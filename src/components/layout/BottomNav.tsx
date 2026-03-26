"use client";

import { useTimer } from "@/hooks/use-timer";
import { formatDuration } from "@/lib/utils";

export function BottomNav() {
  const { activeTimer, elapsed, start, stop, loading } = useTimer();

  if (loading) return null;

  return (
    <div className="md:hidden fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
      {activeTimer ? (
        // Active timer pill
        <div className="flex items-center gap-3 bg-[#31332f] text-white rounded-full px-5 py-3 paper-shadow">
          {/* Pulsing dot */}
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#b9ecee] opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#b9ecee]" />
          </span>

          {/* Elapsed time */}
          <span
            className="font-semibold text-sm tracking-wide tabular-nums min-w-[5rem] text-center"
            style={{ fontFamily: "var(--font-newsreader, 'Newsreader'), serif", fontStyle: "italic" }}
          >
            {formatDuration(elapsed)}
          </span>

          {/* Stop button */}
          <button
            onClick={() => stop(false)}
            className="flex items-center justify-center w-7 h-7 rounded-full bg-[#a73b21] hover:bg-[#791903] transition-colors"
            aria-label="Stop timer"
          >
            <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>
              stop
            </span>
          </button>
        </div>
      ) : (
        // Idle pill — tapping opens timer page (or triggers a quick start)
        <div className="flex items-center gap-2 bg-white text-[#31332f] rounded-full px-5 py-3 paper-shadow border border-[#efeee9]">
          <span className="material-symbols-outlined text-[#366769]" style={{ fontSize: "18px" }}>
            play_circle
          </span>
          <span
            className="text-sm font-medium text-[#5e605b]"
            style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
          >
            Start new session
          </span>
        </div>
      )}
    </div>
  );
}
