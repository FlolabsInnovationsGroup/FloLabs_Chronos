"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { InlineSearchLoading } from "@/components/ui/InlineSearchLoading";
import { FloatingListPanel } from "@/components/ui/FloatingListPanel";

interface TaskOption {
  id: string;
  title: string;
}

interface TaskPickerProps {
  value?: { id: string; title: string } | null;
  onChange: (task: { id: string; title: string } | null) => void;
  placeholder?: string;
  label?: string;
  disabled?: boolean;
}

export function TaskPicker({
  value,
  onChange,
  placeholder = "Select a task…",
  label = "Task",
  disabled = false,
}: TaskPickerProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState<TaskOption[]>([]);
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
    if (!open) {
      setLoading(false);
      setErrorMessage("");
      return;
    }

    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setErrorMessage("");
      try {
        const res = await fetch(`/api/tasks?q=${encodeURIComponent(query)}`, { signal: ctrl.signal });
        const data = await res.json();

        if (!res.ok) {
          setOptions([]);
          setErrorMessage(data.error ?? "Task search failed");
          return;
        }

        setOptions((data.tasks ?? []) as TaskOption[]);

        if (data.meta && data.meta.taskSearchConfigured === false) {
          setErrorMessage("Task search is not configured in the running environment.");
          return;
        }

        if (data.error) {
          setErrorMessage(data.error);
          return;
        }
      } catch {
        setOptions([]);
        setErrorMessage("Could not load tasks.");
      } finally {
        setLoading(false);
      }
    }, query.trim() ? 120 : 0);

    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [open, query]);

  const selectedTitle = value?.title ?? "";
  const visibleInputValue = useMemo(() => {
    if (open) return query;
    return selectedTitle;
  }, [open, query, selectedTitle]);

  function choose(option: TaskOption) {
    onChange({ id: option.id, title: option.title });
    setOpen(false);
    setQuery(option.title);
    inputRef.current?.blur();
  }

  function clear() {
    onChange(null);
    setQuery("");
    setOptions([]);
    setErrorMessage("");
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
            task
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
            placeholder={placeholder}
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
              aria-label="Clear selected task"
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
            <div
              className="px-3 py-2 text-sm text-subtle-ink"
              style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
            >
              {loading ? "Searching tasks…" : query.trim() ? "No matching tasks" : "Start typing to search tasks"}
            </div>
          ) : (
            options.map((option) => {
              const active = option.id === value?.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(option)}
                  className={`w-full rounded-xl px-3 py-2 text-left text-sm transition-colors flex items-center gap-2 ${
                    active ? "bg-surface-container-high text-on-background" : "text-on-surface-variant hover:bg-surface-container-low"
                  }`}
                  style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                >
                  <span className="material-symbols-outlined shrink-0 text-primary" style={{ fontSize: "16px" }}>
                    task
                  </span>
                  <span className="truncate">{option.title}</span>
                  {active && (
                    <span className="material-symbols-outlined ml-auto text-primary" style={{ fontSize: "16px" }}>
                      check
                    </span>
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
