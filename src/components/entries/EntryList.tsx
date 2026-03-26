"use client";

import { groupEntriesByDate, formatDuration } from "@/lib/utils";
import { EntryCard } from "./EntryCard";
import type { TimeEntry } from "@/types";

interface EntryListProps {
  entries: TimeEntry[];
  onResume?: (entry: TimeEntry) => void;
  emptyMessage?: string;
}

export function EntryList({
  entries,
  onResume,
  emptyMessage = "No time entries yet. Start your first session above.",
}: EntryListProps) {
  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <span className="material-symbols-outlined text-[#b2b2ad]" style={{ fontSize: "40px" }}>
          hourglass_empty
        </span>
        <p
          className="text-sm text-[#b2b2ad] text-center max-w-xs"
          style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
        >
          {emptyMessage}
        </p>
      </div>
    );
  }

  const groups = groupEntriesByDate(entries);

  return (
    <div className="flex flex-col gap-6">
      {groups.map((group) => {
        // Sum durations for the group
        const groupTotalMs = group.entries.reduce((sum, e) => sum + (e.durationMs ?? 0), 0);

        return (
          <div key={group.date} className="flex flex-col gap-1">
            {/* Date group header */}
            <div className="flex items-center justify-between px-4 py-2">
              <div className="flex items-center gap-3">
                {/* Left border accent */}
                <div className="w-0.5 h-4 bg-[#abdddf] rounded-full" />
                <span
                  className="text-sm font-semibold text-[#5e605b] uppercase tracking-wide"
                  style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                >
                  {group.label}
                </span>
                <span
                  className="text-xs text-[#b2b2ad]"
                  style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                >
                  {group.entries.length} {group.entries.length === 1 ? "entry" : "entries"}
                </span>
              </div>
              {/* Group total */}
              <span
                className="text-sm font-light italic text-[#5e605b] tabular-nums"
                style={{ fontFamily: "var(--font-newsreader, 'Newsreader'), serif" }}
              >
                {formatDuration(groupTotalMs)}
              </span>
            </div>

            {/* Entry cards */}
            <div className="flex flex-col">
              {group.entries.map((entry) => (
                <EntryCard key={entry.id} entry={entry} onResume={onResume} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
