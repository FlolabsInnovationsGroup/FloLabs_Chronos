"use client";

import React, {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

type TooltipPosition = "top" | "bottom" | "left" | "right";

interface TooltipProps {
  label: string;
  delayMs?: number;
  position?: TooltipPosition;
  children: React.ReactElement;
}

interface TooltipCoordinates {
  top: number;
  left: number;
  transform: string;
}

const VIEWPORT_PADDING = 12;
const TOOLTIP_OFFSET = 10;
const MOBILE_BREAKPOINT = 640;
const POSITION_PRIORITY: Record<TooltipPosition, TooltipPosition[]> = {
  top: ["top", "bottom", "right", "left"],
  bottom: ["bottom", "top", "right", "left"],
  left: ["left", "right", "top", "bottom"],
  right: ["right", "left", "top", "bottom"],
};

function getCoordinates(
  triggerRect: DOMRect,
  tooltipRect: DOMRect,
  preferred: TooltipPosition
): TooltipCoordinates {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  const fits = (candidate: TooltipPosition) => {
    switch (candidate) {
      case "top":
        return triggerRect.top >= tooltipRect.height + TOOLTIP_OFFSET + VIEWPORT_PADDING;
      case "bottom":
        return viewportHeight - triggerRect.bottom >= tooltipRect.height + TOOLTIP_OFFSET + VIEWPORT_PADDING;
      case "left":
        return triggerRect.left >= tooltipRect.width + TOOLTIP_OFFSET + VIEWPORT_PADDING;
      case "right":
        return viewportWidth - triggerRect.right >= tooltipRect.width + TOOLTIP_OFFSET + VIEWPORT_PADDING;
    }
  };

  const resolved =
    POSITION_PRIORITY[preferred].find((candidate) => fits(candidate)) ??
    (viewportWidth < MOBILE_BREAKPOINT ? "bottom" : preferred);

  let top = 0;
  let left = 0;
  let transform = "translateX(-50%)";

  switch (resolved) {
    case "top":
      top = triggerRect.top - TOOLTIP_OFFSET;
      left = triggerRect.left + triggerRect.width / 2;
      transform = "translate(-50%, -100%)";
      break;
    case "bottom":
      top = triggerRect.bottom + TOOLTIP_OFFSET;
      left = triggerRect.left + triggerRect.width / 2;
      transform = "translateX(-50%)";
      break;
    case "left":
      top = triggerRect.top + triggerRect.height / 2;
      left = triggerRect.left - TOOLTIP_OFFSET;
      transform = "translate(-100%, -50%)";
      break;
    case "right":
      top = triggerRect.top + triggerRect.height / 2;
      left = triggerRect.right + TOOLTIP_OFFSET;
      transform = "translateY(-50%)";
      break;
  }

  const estimatedLeft =
    resolved === "left"
      ? left - tooltipRect.width
      : resolved === "right"
        ? left
        : left - tooltipRect.width / 2;
  const estimatedTop =
    resolved === "top"
      ? top - tooltipRect.height
      : resolved === "bottom"
        ? top
        : top - tooltipRect.height / 2;

  const clampedLeft = Math.min(
    Math.max(estimatedLeft, VIEWPORT_PADDING),
    viewportWidth - tooltipRect.width - VIEWPORT_PADDING
  );
  const clampedTop = Math.min(
    Math.max(estimatedTop, VIEWPORT_PADDING),
    viewportHeight - tooltipRect.height - VIEWPORT_PADDING
  );

  if (resolved === "top" || resolved === "bottom") {
    left = clampedLeft + tooltipRect.width / 2;
  } else {
    top = clampedTop + tooltipRect.height / 2;
  }

  return { top, left, transform };
}

export function Tooltip({
  label,
  delayMs = 3000,
  position = "top",
  children,
}: TooltipProps) {
  const tooltipId = useId();
  const wrapperRef = useRef<HTMLSpanElement | null>(null);
  const tooltipRef = useRef<HTMLSpanElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState<TooltipCoordinates | null>(null);

  useEffect(() => {
    setMounted(true);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (touchHideTimerRef.current) clearTimeout(touchHideTimerRef.current);
    };
  }, []);

  const clearPendingTimers = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (touchHideTimerRef.current) {
      clearTimeout(touchHideTimerRef.current);
      touchHideTimerRef.current = null;
    }
  }, []);

  const hideTooltip = useCallback(() => {
    clearPendingTimers();
    setVisible(false);
  }, [clearPendingTimers]);

  const showTooltip = useCallback(
    (immediate = false) => {
      clearPendingTimers();
      if (immediate) {
        setVisible(true);
        return;
      }
      timerRef.current = setTimeout(() => setVisible(true), delayMs);
    },
    [clearPendingTimers, delayMs]
  );

  const updatePosition = useCallback(() => {
    const wrapper = wrapperRef.current;
    const tooltip = tooltipRef.current;
    if (!wrapper || !tooltip) return;

    setCoords(getCoordinates(wrapper.getBoundingClientRect(), tooltip.getBoundingClientRect(), position));
  }, [position]);

  useLayoutEffect(() => {
    if (!visible) {
      setCoords(null);
      return;
    }
    updatePosition();
  }, [updatePosition, visible]);

  useEffect(() => {
    if (!visible) return;

    const handleWindowChange = () => updatePosition();
    window.addEventListener("resize", handleWindowChange);
    window.addEventListener("scroll", handleWindowChange, true);

    return () => {
      window.removeEventListener("resize", handleWindowChange);
      window.removeEventListener("scroll", handleWindowChange, true);
    };
  }, [updatePosition, visible]);

  return (
    <span
      ref={wrapperRef}
      className="inline-flex align-middle"
      aria-describedby={visible ? tooltipId : undefined}
      onMouseEnter={() => showTooltip(false)}
      onMouseLeave={hideTooltip}
      onFocus={() => showTooltip(true)}
      onBlur={hideTooltip}
      onTouchStart={() => {
        showTooltip(true);
        touchHideTimerRef.current = setTimeout(() => setVisible(false), 1800);
      }}
    >
      {children}
      {mounted &&
        visible &&
        createPortal(
          <span
            id={tooltipId}
            ref={tooltipRef}
            role="tooltip"
            className="pointer-events-none fixed z-[80] max-w-[min(calc(100vw-1.5rem),20rem)] rounded-md bg-chrome px-2.5 py-1.5 text-xs text-on-chrome shadow-md whitespace-normal break-words animate-[tooltipFadeIn_150ms_ease-out]"
            style={{
              top: coords?.top ?? -9999,
              left: coords?.left ?? -9999,
              transform: coords?.transform ?? "translateX(-50%)",
              fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif",
            }}
          >
            {label}
          </span>,
          document.body
        )}
    </span>
  );
}
