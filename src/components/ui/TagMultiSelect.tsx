"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { cn } from "@/lib/utils";

export interface TagOption {
  id: string;
  name: string;
}

interface TagMultiSelectProps {
  /** Currently selected tag IDs */
  value: string[];
  onChange: (ids: string[]) => void;
  /** All available tags for the current user (loaded externally) */
  options: TagOption[];
  /** Called when user wants to create a new tag by name. Should return the new tag. */
  onCreate?: (name: string) => Promise<TagOption | null>;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function TagMultiSelect({
  value,
  onChange,
  options,
  onCreate,
  placeholder = "Add tags…",
  disabled,
  className,
}: TagMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [creating, setCreating] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = options.filter((o) => value.includes(o.id));
  const trimmed = inputValue.trim().toLowerCase();

  const filtered = options.filter(
    (o) =>
      !value.includes(o.id) &&
      (trimmed === "" || o.name.toLowerCase().includes(trimmed))
  );

  const canCreate =
    !!onCreate &&
    trimmed.length > 0 &&
    !options.some((o) => o.name.toLowerCase() === trimmed);

  // Close on outside click
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

  function addTag(id: string) {
    if (!value.includes(id)) onChange([...value, id]);
    setInputValue("");
    inputRef.current?.focus();
  }

  function removeTag(id: string) {
    onChange(value.filter((v) => v !== id));
  }

  async function handleCreate() {
    if (!onCreate || !trimmed || creating) return;
    setCreating(true);
    try {
      const newTag = await onCreate(trimmed);
      if (newTag) {
        onChange([...value, newTag.id]);
        setInputValue("");
      }
    } finally {
      setCreating(false);
      inputRef.current?.focus();
    }
  }

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Backspace" && inputValue === "" && selected.length > 0) {
        removeTag(selected[selected.length - 1].id);
      }
      if ((e.key === "Enter" || e.key === ",") && trimmed) {
        e.preventDefault();
        // If there's an exact match in filtered, pick the first
        if (filtered.length > 0) {
          const exact = filtered.find((o) => o.name.toLowerCase() === trimmed);
          addTag(exact ? exact.id : filtered[0].id);
        } else if (canCreate) {
          void handleCreate();
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [inputValue, selected, filtered, canCreate, trimmed]
  );

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      {/* Input box with chips */}
      <div
        className={cn(
          "min-h-9 flex flex-wrap items-center gap-1.5 rounded-xl bg-[#f5f4ef] px-3 py-1.5 cursor-text",
          "focus-within:ring-2 focus-within:ring-[#366769]/20",
          disabled && "opacity-50 pointer-events-none"
        )}
        onClick={() => {
          setOpen(true);
          inputRef.current?.focus();
        }}
      >
        {/* Selected tag chips */}
        {selected.map((tag) => (
          <span
            key={tag.id}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#e9e8e3] text-xs font-medium text-[#31332f]"
            style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: "12px", color: "#5e605b" }}>
              label
            </span>
            {tag.name}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                removeTag(tag.id);
              }}
              className="ml-0.5 text-[#5e605b] hover:text-[#a73b21] transition-colors"
              aria-label={`Remove ${tag.name}`}
            >
              <span className="material-symbols-outlined" style={{ fontSize: "12px" }}>
                close
              </span>
            </button>
          </span>
        ))}

        {/* Text input */}
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={selected.length === 0 ? placeholder : ""}
          className="flex-1 min-w-[80px] bg-transparent text-sm text-[#31332f] placeholder:text-[#b2b2ad] outline-none"
          style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
          disabled={disabled}
        />

        <span className="material-symbols-outlined ml-auto shrink-0 text-[#5e605b]" style={{ fontSize: "18px" }}>
          label
        </span>
      </div>

      {/* Dropdown */}
      {open && (filtered.length > 0 || canCreate) && (
        <div className="absolute left-0 right-0 top-[calc(100%+0.4rem)] z-50 overflow-hidden rounded-2xl bg-[#fbf9f5] paper-shadow ring-1 ring-[#31332f]/6">
          <div className="max-h-60 overflow-y-auto overscroll-contain p-1.5">
            {filtered.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onPointerDown={(e) => {
                  e.preventDefault(); // prevent blur
                  addTag(opt.id);
                }}
                className="w-full rounded-xl px-3 py-2 text-left text-sm text-[#5e605b] hover:bg-[#f5f4ef] flex items-center gap-2 transition-colors"
                style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>label</span>
                <span className="truncate">{opt.name}</span>
              </button>
            ))}

            {canCreate && (
              <button
                type="button"
                onPointerDown={(e) => {
                  e.preventDefault();
                  void handleCreate();
                }}
                disabled={creating}
                className="w-full rounded-xl px-3 py-2 text-left text-sm text-[#366769] hover:bg-[#f5f4ef] flex items-center gap-2 transition-colors font-medium"
                style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>add</span>
                {creating ? "Creating…" : `Create "${inputValue.trim()}"`}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
