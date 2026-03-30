"use client";

import { useState } from "react";
import { EntryList } from "@/components/entries/EntryList";
import type { TimeEntry } from "@/types";

interface ReportEntriesProps {
  entries: TimeEntry[];
}

export function ReportEntries({ entries }: ReportEntriesProps) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="bg-surface-container-lowest rounded-xl paper-shadow overflow-hidden">
      {/* Section header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-6 py-4 bg-[#f5f4ef] hover:bg-[#efeee9] transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-3">
          <h3
            className="text-sm font-semibold text-[#31332f]"
            style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
          >
            Detailed Entries
          </h3>
          <span
            className="text-xs text-[#b2b2ad]"
            style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
          >
            {entries.length} {entries.length === 1 ? "entry" : "entries"}
          </span>
        </div>
        <span
          className="material-symbols-outlined text-[#5e605b] transition-transform duration-200"
          style={{
            fontSize: "20px",
            transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
          }}
        >
          expand_more
        </span>
      </button>

      {/* Entry list */}
      {expanded && (
        <div className="px-2 py-2">
          <EntryList
            entries={entries}
            emptyMessage="No entries match the current filters."
          />
        </div>
      )}
    </div>
  );
}
