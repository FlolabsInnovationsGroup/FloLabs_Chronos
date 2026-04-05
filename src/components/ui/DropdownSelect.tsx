"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { FloatingListPanel } from "@/components/ui/FloatingListPanel";

export interface DropdownOption {
  value: string;
  label: string;
  icon?: string;
  color?: string;
}

interface DropdownSelectProps {
  options: DropdownOption[];
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  className?: string;
  buttonClassName?: string;
  panelClassName?: string;
  disabled?: boolean;
  leadingIcon?: string;
  leadingIconColor?: string;
}

export function DropdownSelect({
  options,
  value,
  onChange,
  placeholder = "Select an option",
  className,
  buttonClassName,
  panelClassName,
  disabled,
  leadingIcon,
  leadingIconColor = "var(--c-on-surface-variant)",
}: DropdownSelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const selected = useMemo(
    () => options.find((opt) => opt.value === value),
    [options, value]
  );

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      const t = event.target as Node;
      if (rootRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  function selectOption(nextValue: string) {
    onChange?.(nextValue);
    setOpen(false);
    buttonRef.current?.focus();
  }

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "w-full min-h-9 appearance-none rounded-xl border-0 bg-surface-container-low px-3 py-1.5 text-sm text-on-background shadow-none outline-none transition-all duration-150",
          "focus:ring-2 focus:ring-inset focus:ring-primary/20 disabled:opacity-50 disabled:cursor-not-allowed",
          "inline-flex items-center gap-2 cursor-pointer",
          buttonClassName
        )}
        style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {selected?.color ? (
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: selected.color }} />
        ) : leadingIcon ? (
          <span
            className="material-symbols-outlined shrink-0"
            style={{ fontSize: "15px", color: leadingIconColor }}
          >
            {leadingIcon}
          </span>
        ) : null}

        {selected?.icon && (
          <span className="material-symbols-outlined shrink-0" style={{ fontSize: "16px", color: selected.color ?? "var(--c-on-surface-variant)" }}>
            {selected.icon}
          </span>
        )}

        <span className={cn("truncate text-left", !selected && "text-outline-variant")}>{selected?.label ?? placeholder}</span>
        <span className="material-symbols-outlined ml-auto shrink-0 text-on-surface-variant" style={{ fontSize: "18px" }}>
          expand_more
        </span>
      </button>

      <FloatingListPanel
        ref={panelRef}
        open={open}
        anchorRef={rootRef}
        shellClassName={panelClassName}
        scrollClassName="max-h-72 overflow-y-auto overscroll-contain p-1.5"
      >
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => selectOption(option.value)}
              className={cn(
                "w-full rounded-xl px-3 py-2 text-left text-sm transition-colors flex items-center gap-2",
                active ? "bg-surface-container-high text-on-background" : "text-on-surface-variant hover:bg-surface-container-low"
              )}
              style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
              role="option"
              aria-selected={active}
            >
              {option.color ? (
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: option.color }} />
              ) : option.icon ? (
                <span className="material-symbols-outlined shrink-0" style={{ fontSize: "16px", color: option.color ?? "var(--c-on-surface-variant)" }}>
                  {option.icon}
                </span>
              ) : null}
              <span className="truncate">{option.label}</span>
              {active && (
                <span className="material-symbols-outlined ml-auto text-primary" style={{ fontSize: "16px" }}>
                  check
                </span>
              )}
            </button>
          );
        })}
      </FloatingListPanel>
    </div>
  );
}
