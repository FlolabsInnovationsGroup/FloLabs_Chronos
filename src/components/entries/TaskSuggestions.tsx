"use client";

import { useEffect, useState } from "react";

export interface TaskSuggestion {
  entryId: string;
  description: string;
  projectId: string | null;
  projectName: string;
  tagIds: string[];
  tagNames: string[];
  notionTaskPageId?: string | null;
  notionTaskTitle?: string | null;
  startedAt: string;
}

interface TaskSuggestionsProps {
  query: string;
  open: boolean;
  onPick: (suggestion: TaskSuggestion) => void;
}

export function TaskSuggestions({ query, open, onPick }: TaskSuggestionsProps) {
  const [suggestions, setSuggestions] = useState<TaskSuggestion[]>([]);

  useEffect(() => {
    if (!open) {
      setSuggestions([]);
      return;
    }

    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/entries/suggestions?q=${encodeURIComponent(query)}`, {
          signal: ctrl.signal,
        });
        const data = await res.json();
        setSuggestions((data.suggestions ?? []) as TaskSuggestion[]);
      } catch {
        setSuggestions([]);
      }
    }, query.trim() ? 120 : 0);

    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [open, query]);

  if (!open || suggestions.length === 0) return null;

  return (
    <div className="mt-2 rounded-xl border border-[#efeee9] bg-white shadow-lg overflow-hidden">
      <div
        className="px-3 py-2 text-xs uppercase tracking-wide text-[#7a7c76] bg-[#fbf9f5]"
        style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
      >
        Suggested from your last 2 weeks
      </div>
      <div className="flex flex-col">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion.entryId}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onPick(suggestion)}
            className="px-3 py-3 text-left hover:bg-[#f5f4ef] transition-colors border-t border-[#f5f4ef]"
          >
            <div
              className="text-sm text-[#31332f]"
              style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
            >
              {suggestion.description || "No description"}
            </div>
            <div
              className="mt-1 text-xs text-[#5e605b] flex flex-wrap gap-x-1.5 gap-y-1"
              style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
            >
              <span>{suggestion.projectName}</span>
              {suggestion.tagNames.length > 0 && <span>· {suggestion.tagNames.join(", ")}</span>}
              {suggestion.notionTaskTitle && (
                <span className="inline-flex items-center gap-1 text-[#366769]">
                  ·
                  <span className="material-symbols-outlined" style={{ fontSize: "13px" }}>
                    task
                  </span>
                  {suggestion.notionTaskTitle}
                </span>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
