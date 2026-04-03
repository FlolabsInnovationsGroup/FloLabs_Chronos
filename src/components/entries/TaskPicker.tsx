"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState<TaskOption[]>([]);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        setQuery("");
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
      setOptions([]);
      setLoading(false);
      return;
    }

    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/tasks?q=${encodeURIComponent(query)}`, { signal: ctrl.signal });
        const data = await res.json();
        setOptions((data.tasks ?? []) as TaskOption[]);
      } catch {
        setOptions([]);
      } finally {
        setLoading(false);
      }
    }, query.trim() ? 150 : 0);

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
    setQuery("");
    inputRef.current?.blur();
  }

  function clear() {
    onChange(null);
    setQuery("");
    setOptions([]);
  }

  return (
    <div ref={rootRef} className="flex flex-col gap-1.5 relative">
      <label
        className="text-xs font-medium text-[#5e605b] uppercase tracking-wide"
        style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
      >
        {label}
      </label>

      <div className="relative">
        <div className="flex items-center gap-2 rounded-xl bg-[#f5f4ef] px-3 py-2 min-h-11">
          <span className="material-symbols-outlined text-[#366769]" style={{ fontSize: "18px" }}>
            task
          </span>
          <input
            ref={inputRef}
            type="text"
            value={visibleInputValue}
            onFocus={() => {
              if (disabled) return;
              setOpen(true);
              setQuery("");
            }}
            onChange={(e) => {
              setOpen(true);
              setQuery(e.target.value);
            }}
            placeholder={placeholder}
            disabled={disabled}
            className="flex-1 bg-transparent outline-none text-sm text-[#31332f] placeholder:text-[#b2b2ad] disabled:cursor-not-allowed"
            style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
          />
          {loading && (
            <span className="text-xs text-[#5e605b]" style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}>
              Searching…
            </span>
          )}
          {value && !disabled && (
            <button
              type="button"
              onClick={clear}
              className="p-1 rounded text-[#8f918b] hover:text-[#31332f] transition-colors"
              aria-label="Clear selected task"
            >
              <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>
                close
              </span>
            </button>
          )}
        </div>

        {open && (
          <div className="absolute left-0 right-0 top-[calc(100%+0.4rem)] z-50 overflow-hidden rounded-2xl bg-[#fbf9f5] paper-shadow ring-1 ring-[#31332f]/6">
            <div className="max-h-72 overflow-y-auto overscroll-contain p-1.5">
              {options.length === 0 ? (
                <div
                  className="px-3 py-2 text-sm text-[#8f918b]"
                  style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                >
                  {loading ? "Searching tasks…" : "No matching tasks"}
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
                        active ? "bg-[#e9e8e3] text-[#31332f]" : "text-[#5e605b] hover:bg-[#f5f4ef]"
                      }`}
                      style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                    >
                      <span className="material-symbols-outlined shrink-0 text-[#366769]" style={{ fontSize: "16px" }}>
                        task
                      </span>
                      <span className="truncate">{option.title}</span>
                      {active && (
                        <span className="material-symbols-outlined ml-auto text-[#366769]" style={{ fontSize: "16px" }}>
                          check
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
