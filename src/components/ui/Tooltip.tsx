"use client";

import React, { useCallback, useRef, useState } from "react";

interface TooltipProps {
  /** Text to display after hovering for the delay duration */
  label: string;
  /** Delay in ms before the tooltip appears (default: 3000) */
  delayMs?: number;
  /** Tooltip placement */
  position?: "top" | "bottom" | "left" | "right";
  children: React.ReactElement;
}

export function Tooltip({
  label,
  delayMs = 3000,
  position = "top",
  children,
}: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleEnter = useCallback(() => {
    timerRef.current = setTimeout(() => setVisible(true), delayMs);
  }, [delayMs]);

  const handleLeave = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setVisible(false);
  }, []);

  const positionClasses: Record<string, string> = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
    left: "right-full top-1/2 -translate-y-1/2 mr-2",
    right: "left-full top-1/2 -translate-y-1/2 ml-2",
  };

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      onFocus={handleEnter}
      onBlur={handleLeave}
    >
      {children}
      {visible && (
        <span
          role="tooltip"
          className={`absolute z-50 pointer-events-none whitespace-nowrap rounded-md bg-[#31332f] px-2.5 py-1.5 text-xs text-[#fbf9f5] shadow-md animate-[tooltipFadeIn_150ms_ease-out] ${positionClasses[position]}`}
          style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
        >
          {label}
        </span>
      )}
    </span>
  );
}
