"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

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

  const selected = options.filter((o) => value.includes(o.id));
  const available = options.filter((o) => !value.includes(o.id));

  useEffect(() => {
    if (!open) return;
    function handler(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
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
          "min-h-9 flex flex-wrap items-center gap-1.5 rounded-xl bg-[#f5f4ef] px-3 py-1.5 cursor-text",
          "focus-within:ring-2 focus-within:ring-[#366769]/20",
          disabled && "opacity-50 pointer-events-none"
        )}
        onClick={() => setOpen((v) => !v)}
      >
        {selected.length === 0 && (
          <span className="text-sm text-[#b2b2ad]" style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}>
            {placeholder}
          </span>
        )}
        {selected.map((item) => (
          <span
            key={item.id}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#e9e8e3] text-xs font-medium text-[#31332f]"
            style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: "12px", color: "#5e605b" }}>
              group
            </span>
            {item.name}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                remove(item.id);
              }}
              className="ml-0.5 text-[#5e605b] hover:text-[#a73b21] transition-colors"
              aria-label={`Remove ${item.name}`}
            >
              <span className="material-symbols-outlined" style={{ fontSize: "12px" }}>
                close
              </span>
            </button>
          </span>
        ))}
        <span className="material-symbols-outlined ml-auto shrink-0 text-[#5e605b]" style={{ fontSize: "18px" }}>
          groups
        </span>
      </div>

      {open && available.length > 0 && (
        <div className="absolute left-0 right-0 top-[calc(100%+0.4rem)] z-50 overflow-hidden rounded-2xl bg-[#fbf9f5] paper-shadow ring-1 ring-[#31332f]/6">
          <div className="max-h-60 overflow-y-auto overscroll-contain p-1.5">
            {available.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onPointerDown={(e) => {
                  e.preventDefault();
                  add(opt.id);
                }}
                className="w-full rounded-xl px-3 py-2 text-left text-sm text-[#5e605b] hover:bg-[#f5f4ef] flex items-center gap-2 transition-colors"
                style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>group</span>
                <span className="truncate">{opt.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
