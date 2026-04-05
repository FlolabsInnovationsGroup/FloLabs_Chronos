"use client";

import Link from "next/link";
import { useTimer } from "@/hooks/use-timer";
import { TimerActionIndicator } from "@/components/timer/TimerActionIndicator";
import { formatDuration } from "@/lib/utils";
import { getTimerStopValidation } from "@/lib/timer-rules";

export function BottomNav() {
  const { activeTimer, elapsed, stop, loading } = useTimer();

  if (loading) return null;

  const stopValidation = getTimerStopValidation(activeTimer);
  const canStop = !!activeTimer && stopValidation.canStop;

  return (
    <div className="md:hidden fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2 w-[calc(100%-2rem)] max-w-sm">
      {activeTimer ? (
        <>
          <TimerActionIndicator compact />
          {!canStop && (
            <div className="w-full rounded-2xl border border-warm-border bg-warm-surface px-4 py-3 text-sm text-error-dim shadow-sm">
              <div className="flex items-start gap-2">
                <span className="material-symbols-outlined shrink-0" style={{ fontSize: "18px" }}>
                  info
                </span>
                <p style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}>
                  You can&apos;t stop this timer yet. {stopValidation.message}
                </p>
              </div>
            </div>
          )}

          <div className="flex items-center gap-3 bg-chrome text-on-chrome rounded-full px-5 py-3 paper-shadow">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-error opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-error" />
            </span>

            <span
              className="font-semibold text-sm tracking-wide tabular-nums min-w-[5rem] text-center"
              style={{ fontFamily: "var(--font-newsreader, 'Newsreader'), serif", fontStyle: "italic" }}
            >
              {formatDuration(elapsed)}
            </span>

            <button
              onClick={() => void (canStop ? stop(false) : Promise.resolve())}
              disabled={!canStop}
              className={`flex items-center justify-center w-7 h-7 rounded-full transition-colors ${
                canStop ? "bg-error hover:bg-error-dim" : "bg-disabled-fill text-disabled-on cursor-not-allowed"
              }`}
              aria-label={canStop ? "Stop timer" : stopValidation.message}
            >
              <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>
                stop
              </span>
            </button>
          </div>
        </>
      ) : (
        <Link
          href="/timer"
          className="flex items-center gap-2 bg-surface-container-lowest text-on-background rounded-full px-5 py-3 paper-shadow"
        >
          <span className="material-symbols-outlined text-primary" style={{ fontSize: "18px" }}>
            play_circle
          </span>
          <span
            className="text-sm font-medium text-on-surface-variant"
            style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
          >
            Start new session
          </span>
        </Link>
      )}
    </div>
  );
}
