"use client";

import { useMemo, useState } from "react";
import { EntryList } from "@/components/entries/EntryList";
import type { TimeEntry } from "@/types";

interface ReportEntriesProps {
  entries: TimeEntry[];
}

type SortKey = "duration" | "project" | "tags" | "date" | "description" | "user";
type SortDir = "asc" | "desc";

export function ReportEntries({ entries }: ReportEntriesProps) {
  const [expanded, setExpanded] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "date" || key === "duration" ? "desc" : "asc");
    }
  }

  const sortedEntries = useMemo(() => {
    const sorted = [...entries];
    const mult = sortDir === "asc" ? 1 : -1;

    sorted.sort((a, b) => {
      switch (sortKey) {
        case "duration":
          return mult * ((a.durationMs ?? 0) - (b.durationMs ?? 0));
        case "project":
          return mult * (a.project?.name ?? "").localeCompare(b.project?.name ?? "");
        case "tags": {
          const aTags = (a.tags ?? []).map((tag) => tag.name).sort().join(", ");
          const bTags = (b.tags ?? []).map((tag) => tag.name).sort().join(", ");
          return mult * aTags.localeCompare(bTags);
        }
        case "description":
          return mult * (a.description ?? "").localeCompare(b.description ?? "");
        case "user":
          return mult * (a.user?.name ?? "").localeCompare(b.user?.name ?? "");
        case "date":
        default:
          return mult * (new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());
      }
    });

    return sorted;
  }, [entries, sortDir, sortKey]);

  const columns: { label: string; key: SortKey }[] = [
    { label: "Date", key: "date" },
    { label: "User", key: "user" },
    { label: "Description", key: "description" },
    { label: "Project", key: "project" },
    { label: "Tags", key: "tags" },
    { label: "Duration", key: "duration" },
  ];

  return (
    <div className="bg-surface-container-lowest rounded-xl paper-shadow">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className={`w-full flex items-center justify-between px-6 py-4 bg-[#f5f4ef] hover:bg-[#efeee9] transition-colors cursor-pointer ${
          expanded ? "rounded-t-xl" : "rounded-xl"
        }`}
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

      {expanded && (
        <div className="px-2 py-2 flex flex-col gap-3 rounded-b-xl">
          <div className="flex flex-col gap-2 px-4 py-3 rounded-xl bg-[#f5f4ef] sm:flex-row sm:flex-wrap sm:items-center">
            <span
              className="text-xs font-semibold uppercase tracking-wide text-[#5e605b]"
              style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
            >
              Sort by
            </span>
            {columns.map((column) => (
              <button
                key={column.key}
                type="button"
                onClick={() => handleSort(column.key)}
                className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide transition-colors ${
                  sortKey === column.key
                    ? "border-[#d7d2c8] bg-white text-[#31332f]"
                    : "border-transparent bg-transparent text-[#5e605b] hover:text-[#31332f]"
                }`}
                style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
              >
                <span>{column.label}</span>
                {sortKey === column.key && (
                  <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>
                    {sortDir === "asc" ? "arrow_upward" : "arrow_downward"}
                  </span>
                )}
              </button>
            ))}
          </div>

          <EntryList
            entries={sortedEntries}
            emptyMessage="No entries match the current filters."
            grouped={false}
            showUser
          />
        </div>
      )}
    </div>
  );
}
