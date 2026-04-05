"use client";

import React, { useEffect } from "react";
import { cn } from "@/lib/utils";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
  size?: "sm" | "md" | "lg";
}

const sizeStyles = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-2xl",
};

export function Modal({ open, onClose, title, children, className, size = "md" }: ModalProps) {
  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Prevent body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto overscroll-contain">
      {/* Backdrop: fixed so it always covers the viewport while the sheet scrolls */}
      <div
        className="fixed inset-0 bg-[#31332f]/20 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Centering wrapper grows with content; outer overflow-y-auto scrolls the page instead of an inner modal body */}
      <div className="relative flex min-h-full items-center justify-center p-4 py-8 pointer-events-none">
        <div
          className={cn(
            "pointer-events-auto relative w-full bg-surface-container-lowest rounded-xl paper-shadow flex flex-col",
            sizeStyles[size],
            className
          )}
          role="dialog"
          aria-modal="true"
          aria-labelledby={title ? "modal-title" : undefined}
        >
          {title && (
            <div className="flex items-center justify-between px-6 py-5 bg-[#f5f4ef] shrink-0">
              <h2
                id="modal-title"
                className="text-lg font-medium text-[#31332f]"
                style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
              >
                {title}
              </h2>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-[#5e605b] hover:bg-[#f5f4ef] hover:text-[#31332f] transition-colors"
                aria-label="Close modal"
              >
                <span className="material-symbols-outlined" style={{ fontSize: "20px" }}>
                  close
                </span>
              </button>
            </div>
          )}

          <div className="px-6 py-5">{children}</div>
        </div>
      </div>
    </div>
  );
}
