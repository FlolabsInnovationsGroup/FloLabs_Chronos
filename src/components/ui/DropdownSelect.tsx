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
  /** Hide the selected label in the trigger (icon + chevron only). Use `buttonAriaLabel` for accessibility. */
  hideTriggerLabel?: boolean;
  /** Shown as `aria-label` on the trigger when the label is hidden. */
  buttonAriaLabel?: string;
  /** Show a search input at the top of the dropdown to filter options by label. */
  searchable?: boolean;
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
  hideTriggerLabel,
  buttonAriaLabel,
  searchable,
}: DropdownSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const selected = useMemo(
    () => options.find((opt) => opt.value === value),
    [options, value]
  );

  const filteredOptions = useMemo(
    () =>
      searchable && search.trim()
        ? options.filter((opt) =>
            opt.label.toLowerCase().includes(search.toLowerCase())
          )
        : options,
    [options, search, searchable]
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

  useEffect(() => {
    if (!searchable) return;
    if (open) {
      const timer = setTimeout(() => {
        searchRef.current?.focus();
      }, 10);
      return () => clearTimeout(timer);
    } else {
      setSearch("");
    }
  }, [open, searchable]);

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
          !hideTriggerLabel && "w-full",
          "min-h-9 appearance-none rounded-xl border-0 bg-surface-container-low px-3 py-1.5 text-sm text-on-background shadow-none outline-none transition-all duration-150",
          "focus:ring-2 focus:ring-inset focus:ring-primary/20 disabled:opacity-50 disabled:cursor-not-allowed",
          "inline-flex items-center gap-2 cursor-pointer",
          buttonClassName
        )}
        style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={hideTriggerLabel ? buttonAriaLabel : undefined}
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

        {!hideTriggerLabel && (
          <span className={cn("truncate text-left", !selected && "text-outline-variant")}>{selected?.label ?? placeholder}</span>
        )}
        <span
          className={cn(
            "material-symbols-outlined shrink-0 text-on-surface-variant",
            !hideTriggerLabel && "ml-auto"
          )}
          style={{ fontSize: "18px" }}
          aria-hidden
        >
          expand_more
        </span>
      </button>

      <FloatingListPanel
        ref={panelRef}
        open={open}
        anchorRef={rootRef}
        shellClassName={panelClassName}
        scrollClassName={searchable ? "" : "max-h-72 overflow-y-auto overscroll-contain p-1.5"}
      >
        {searchable && (
          <div className="p-2 border-b border-outline-variant/20">
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              className="w-full px-3 py-1.5 text-sm bg-surface-container-low rounded-lg outline-none focus:ring-2 focus:ring-primary/20 placeholder:text-outline-variant text-on-background"
              style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
            />
          </div>
        )}
        <div className={searchable ? "max-h-64 overflow-y-auto overscroll-contain p-1.5" : undefined}>
          {filteredOptions.length === 0 ? (
            <p
              className="text-sm text-outline-variant px-3 py-3 text-center"
              style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
            >
              No results
            </p>
          ) : (
            filteredOptions.map((option) => {
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
            })
          )}
        </div>
      </FloatingListPanel>
    </div>
  );
}
