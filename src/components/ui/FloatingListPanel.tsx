"use client";

import { forwardRef, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

/** Above app modals (z-50) so lists are not clipped by modal scroll layers */
const PANEL_Z = 80;
const GAP_PX = 6;

export interface FloatingListPanelProps {
  open: boolean;
  anchorRef: React.RefObject<HTMLElement | null>;
  shellClassName?: string;
  scrollClassName?: string;
  children: React.ReactNode;
}

export const FloatingListPanel = forwardRef<HTMLDivElement, FloatingListPanelProps>(
  function FloatingListPanel({ open, anchorRef, shellClassName, scrollClassName, children }, ref) {
    const [mounted, setMounted] = useState(false);
    const [box, setBox] = useState({ top: 0, left: 0, width: 0 });

    useLayoutEffect(() => {
      setMounted(true);
    }, []);

    useLayoutEffect(() => {
      if (!open || !anchorRef.current) return;

      function update() {
        const el = anchorRef.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        setBox({ top: r.bottom + GAP_PX, left: r.left, width: r.width });
      }

      update();
      window.addEventListener("resize", update);
      window.addEventListener("scroll", update, true);
      return () => {
        window.removeEventListener("resize", update);
        window.removeEventListener("scroll", update, true);
      };
    }, [open, anchorRef]);

    if (!mounted || !open || typeof document === "undefined") return null;

    return createPortal(
      <div
        ref={ref}
        className={cn("overflow-hidden rounded-2xl bg-[#fbf9f5] paper-shadow ring-1 ring-[#31332f]/6", shellClassName)}
        style={{
          position: "fixed",
          top: box.top,
          left: box.left,
          width: box.width,
          zIndex: PANEL_Z,
        }}
      >
        <div className={cn(scrollClassName)}>{children}</div>
      </div>,
      document.body
    );
  }
);
