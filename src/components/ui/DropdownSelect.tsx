"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

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
  leadingIconColor = "#5e605b",
}: DropdownSelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  const selected = useMemo(
    () => options.find((opt) => opt.value === value),
    [options, value]
  );

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
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
          "w-full min-h-9 appearance-none rounded-xl border-0 bg-[#f5f4ef] px-3 py-1.5 text-sm text-[#31332f] shadow-none outline-none transition-all duration-150",
          "focus:ring-2 focus:ring-[#366769]/20 disabled:opacity-50 disabled:cursor-not-allowed",
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
          <span className="material-symbols-outlined shrink-0" style={{ fontSize: "16px", color: selected.color ?? "#5e605b" }}>
            {selected.icon}
          </span>
        )}

        <span className={cn("truncate text-left", !selected && "text-[#b2b2ad]")}>{selected?.label ?? placeholder}</span>
        <span className="material-symbols-outlined ml-auto shrink-0 text-[#5e605b]" style={{ fontSize: "18px" }}>
          expand_more
        </span>
      </button>

      {open && (
        <div
          className={cn(
            "absolute left-0 right-0 top-[calc(100%+0.4rem)] z-50 overflow-hidden rounded-2xl bg-[#fbf9f5] paper-shadow ring-1 ring-[#31332f]/6",
            panelClassName
          )}
        >
          <div className="max-h-72 overflow-y-auto overscroll-contain p-1.5">
            {options.map((option) => {
              const active = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => selectOption(option.value)}
                  className={cn(
                    "w-full rounded-xl px-3 py-2 text-left text-sm transition-colors flex items-center gap-2",
                    active ? "bg-[#e9e8e3] text-[#31332f]" : "text-[#5e605b] hover:bg-[#f5f4ef]"
                  )}
                  style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                  role="option"
                  aria-selected={active}
                >
                  {option.color ? (
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: option.color }} />
                  ) : option.icon ? (
                    <span className="material-symbols-outlined shrink-0" style={{ fontSize: "16px", color: option.color ?? "#5e605b" }}>
                      {option.icon}
                    </span>
                  ) : null}
                  <span className="truncate">{option.label}</span>
                  {active && (
                    <span className="material-symbols-outlined ml-auto text-[#366769]" style={{ fontSize: "16px" }}>
                      check
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
