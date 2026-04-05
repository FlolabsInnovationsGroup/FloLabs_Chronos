"use client";

import { useTimer } from "@/hooks/use-timer";

interface TimerActionIndicatorProps {
  compact?: boolean;
}

export function TimerActionIndicator({ compact = false }: TimerActionIndicatorProps) {
  const { actionInProgress } = useTimer();

  if (!actionInProgress) return null;

  if (compact) {
    return (
      <div
        className="inline-flex items-center gap-2 rounded-full bg-[#f5f4ef] px-3 py-1.5 text-[#5e605b]"
        style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
        aria-live="polite"
      >
        <svg className="h-4 w-4 animate-spin text-[#366769]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.2" />
          <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
        <span className="text-xs font-medium">Saving…</span>
      </div>
    );
  }

  return (
    <div
      className="inline-flex items-center gap-2 rounded-full bg-[#f5f4ef] px-4 py-2 text-[#5e605b] shadow-sm"
      style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
      aria-live="polite"
    >
      <svg className="h-4 w-4 animate-spin text-[#366769]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.2" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
      <span className="text-xs font-medium">Saving to Chronos / Notion…</span>
    </div>
  );
}
