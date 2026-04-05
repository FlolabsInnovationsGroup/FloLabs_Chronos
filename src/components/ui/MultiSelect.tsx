"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { FloatingListPanel } from "@/components/ui/FloatingListPanel";

export interface MultiSelectOption {
  id: string;
  name: string;
}

interface MultiSelectProps {
  value: string[];
  onChange: (ids: string[]) => void;
  options: MultiSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function MultiSelect({
  value,
  onChange,
  options,
  placeholder = "Select options...",
  disabled,
  className,
}: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const selected = options.filter((o) => value.includes(o.id));
  const available = options.filter((o) => !value.includes(o.id));

  useEffect(() => {
    if (!open) return;
    function handler(e: PointerEvent) {
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    }
    function escape(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", handler);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", handler);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  function add(id: string) {
    if (!value.includes(id)) onChange([...value, id]);
  }

  function remove(id: string) {
    onChange(value.filter((v) => v !== id));
  }

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <div
        className={cn(
          "min-h-9 flex flex-wrap items-center gap-1.5 rounded-xl bg-surface-container-low px-3 py-1.5 cursor-text",
          "focus-within:ring-2 focus-within:ring-primary/20",
          disabled && "opacity-50 pointer-events-none"
        )}
        onClick={() => setOpen((v) => !v)}
      >
        {selected.length === 0 && (
          <span className="text-sm text-outline-variant" style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}>
            {placeholder}
          </span>
        )}
        {selected.map((item) => (
          <span
            key={item.id}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-container-high text-xs font-medium text-on-background"
            style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
          >
            <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: "12px" }}>
              group
            </span>
            {item.name}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                remove(item.id);
              }}
              className="ml-0.5 text-on-surface-variant hover:text-error transition-colors"
              aria-label={`Remove ${item.name}`}
            >
              <span className="material-symbols-outlined" style={{ fontSize: "12px" }}>
                close
              </span>
            </button>
          </span>
        ))}
        <span className="material-symbols-outlined ml-auto shrink-0 text-on-surface-variant" style={{ fontSize: "18px" }}>
          groups
        </span>
      </div>

      <FloatingListPanel
        ref={panelRef}
        open={open && available.length > 0}
        anchorRef={rootRef}
        scrollClassName="max-h-60 overflow-y-auto overscroll-contain p-1.5"
      >
        {available.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              add(opt.id);
            }}
            className="w-full rounded-xl px-3 py-2 text-left text-sm text-on-surface-variant hover:bg-surface-container-low flex items-center gap-2 transition-colors"
            style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>
              group
            </span>
            <span className="truncate">{opt.name}</span>
          </button>
        ))}
      </FloatingListPanel>
    </div>
  );
}
