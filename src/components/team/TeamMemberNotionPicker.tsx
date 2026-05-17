"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { normalizeNotionId } from "@/lib/notion-team-member-link";
import { Button } from "@/components/ui/Button";
import { FloatingListPanel } from "@/components/ui/FloatingListPanel";
import { InlineSearchLoading } from "@/components/ui/InlineSearchLoading";

export interface TeamMemberNotionOption {
  id: string;
  name: string;
  email: string | null;
}

interface TeamMemberNotionPickerProps {
  value: { id: string; title: string } | null;
  onChange: (next: { id: string; title: string } | null) => void;
  variant: "invite" | "edit";
  /** When true, user chose “create new” — search UI is suppressed. */
  createNewActive?: boolean;
  onBeginCreateNew?: () => void;
  onCancelCreateNew?: () => void;
  disabled?: boolean;
  label?: string;
}

export function TeamMemberNotionPicker({
  value,
  onChange,
  variant,
  createNewActive = false,
  onBeginCreateNew,
  onCancelCreateNew,
  disabled = false,
  label = "Notion Team Member",
}: TeamMemberNotionPickerProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState<TeamMemberNotionOption[]>([]);
  const [errorMessage, setErrorMessage] = useState("");

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
        inputRef.current?.blur();
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
    if (!open || createNewActive) {
      setLoading(false);
      setErrorMessage("");
      return;
    }

    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setErrorMessage("");
      try {
        const res = await fetch(`/api/notion/team-members/search?q=${encodeURIComponent(query)}&limit=100`, {
          signal: ctrl.signal,
        });
        const data = await res.json();

        if (!res.ok) {
          setOptions([]);
          setErrorMessage(data.error ?? "Search failed");
          return;
        }

        setOptions((data.pages ?? []) as TeamMemberNotionOption[]);
      } catch {
        setOptions([]);
        setErrorMessage("Could not load Team Member pages.");
      } finally {
        setLoading(false);
      }
    }, query.trim() ? 120 : 0);

    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [open, query, createNewActive]);

  const selectedTitle = value?.title ?? "";
  const visibleInputValue = useMemo(() => {
    if (createNewActive) return "";
    if (open) return query;
    return selectedTitle;
  }, [open, query, selectedTitle, createNewActive]);

  function choose(option: TeamMemberNotionOption) {
    onChange({ id: option.id, title: option.name });
    setOpen(false);
    setQuery(option.name);
    inputRef.current?.blur();
  }

  function clear() {
    onChange(null);
    setQuery("");
    setOptions([]);
    setErrorMessage("");
  }

  if (createNewActive) {
    return (
      <div ref={rootRef} className="flex flex-col gap-1.5">
        <label
          className="text-xs font-medium text-on-surface-variant uppercase tracking-wide"
          style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
        >
          {label}
        </label>
        <div className="rounded-xl border border-primary/30 bg-surface-container-low px-3 py-3 flex flex-col gap-2">
          <p
            className="text-sm text-on-background"
            style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
          >
            A new Team Member page will be created in Notion, with linked Onboarding and Masterclass pages where
            configured.
          </p>
          {onCancelCreateNew && (
            <div>
              <Button variant="ghost" size="sm" type="button" onClick={onCancelCreateNew}>
                Choose existing page instead
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="flex flex-col gap-1.5 relative">
      <label
        className="text-xs font-medium text-on-surface-variant uppercase tracking-wide"
        style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
      >
        {label}
      </label>

      <div className="relative" ref={anchorRef}>
        <div className="flex items-center gap-2 rounded-xl bg-surface-container-low px-3 py-2 min-h-11">
          <span className="material-symbols-outlined text-primary" style={{ fontSize: "18px" }}>
            person_search
          </span>
          <input
            ref={inputRef}
            type="text"
            value={visibleInputValue}
            onFocus={() => {
              if (disabled) return;
              setOpen(true);
              setQuery((current) => current || selectedTitle || "");
            }}
            onChange={(e) => {
              setOpen(true);
              setQuery(e.target.value);
            }}
            placeholder="Search Team Members by name or email…"
            disabled={disabled}
            className="flex-1 bg-transparent outline-none text-sm text-on-background placeholder:text-outline-variant disabled:cursor-not-allowed"
            style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
          />
          {loading && <InlineSearchLoading />}
          {value && !disabled && (
            <button
              type="button"
              onClick={clear}
              className="p-1 rounded text-subtle-ink hover:text-on-background transition-colors"
              aria-label="Clear selected Team Member"
            >
              <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>
                close
              </span>
            </button>
          )}
        </div>

        <FloatingListPanel
          ref={panelRef}
          open={open}
          anchorRef={anchorRef}
          scrollClassName="max-h-72 overflow-y-auto overscroll-contain p-1.5"
        >
          {errorMessage ? (
            <div
              className="px-3 py-2 text-sm text-error"
              style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
            >
              {errorMessage}
            </div>
          ) : options.length === 0 ? (
            <div className="px-3 py-2 flex flex-col gap-2">
              <p
                className="text-sm text-subtle-ink"
                style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
              >
                {loading
                  ? "Searching…"
                  : query.trim()
                    ? "No matching Team Member pages."
                    : "Type to search, or pick from the list when it loads."}
              </p>
              {variant === "invite" && !loading && query.trim() && options.length === 0 && onBeginCreateNew && (
                <Button variant="primary" size="sm" type="button" className="self-start" onClick={onBeginCreateNew}>
                  Create new Team Member in Notion
                </Button>
              )}
            </div>
          ) : (
            options.map((option) => {
              const active =
                Boolean(value?.id) &&
                normalizeNotionId(option.id) === normalizeNotionId(value?.id ?? "");
              return (
                <button
                  key={option.id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(option)}
                  className={`w-full rounded-xl px-3 py-2 text-left text-sm transition-colors flex flex-col gap-0.5 ${
                    active
                      ? "bg-surface-container-high text-on-background"
                      : "text-on-surface-variant hover:bg-surface-container-low"
                  }`}
                  style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                >
                  <span className="flex items-center gap-2">
                    <span className="material-symbols-outlined shrink-0 text-primary" style={{ fontSize: "16px" }}>
                      person
                    </span>
                    <span className="truncate font-medium">{option.name}</span>
                    {active && (
                      <span className="material-symbols-outlined ml-auto text-primary" style={{ fontSize: "16px" }}>
                        check
                      </span>
                    )}
                  </span>
                  {option.email && (
                    <span className="text-xs text-outline-variant truncate pl-7">{option.email}</span>
                  )}
                </button>
              );
            })
          )}
        </FloatingListPanel>
      </div>
    </div>
  );
}
