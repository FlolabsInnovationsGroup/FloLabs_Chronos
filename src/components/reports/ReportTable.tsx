"use client";

import { useMemo, useState } from "react";
import { formatDurationHuman } from "@/lib/utils";
import type { ReportRow } from "@/types";

interface ReportTableProps {
  rows: ReportRow[];
  title?: string;
}

type SortKey = "label" | "entries" | "totalTime" | "share";
type SortDir = "asc" | "desc";

export function ReportTable({ rows, title = "Breakdown" }: ReportTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("totalTime");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const totalMs = rows.reduce((sum, r) => sum + r.totalMs, 0);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "label" ? "asc" : "desc");
    }
  }

  const sortedRows = useMemo(() => {
    const mult = sortDir === "asc" ? 1 : -1;
    const sorted = [...rows];

    sorted.sort((a, b) => {
      switch (sortKey) {
        case "label": {
          if (a.sortDate && b.sortDate) {
            const dateDiff = new Date(a.sortDate).getTime() - new Date(b.sortDate).getTime();
            if (dateDiff !== 0) return mult * dateDiff;
          }
          return mult * a.label.localeCompare(b.label);
        }
        case "entries":
          return mult * (a.entryCount - b.entryCount);
        case "share":
        case "totalTime":
        default:
          return mult * (a.totalMs - b.totalMs);
      }
    });

    return sorted;
  }, [rows, sortDir, sortKey]);

  if (rows.length === 0) {
    return (
      <div className="bg-surface-container-lowest rounded-xl paper-shadow p-6">
        <p
          className="text-sm text-[#b2b2ad] text-center py-8"
          style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
        >
          No data for the selected filters.
        </p>
      </div>
    );
  }

  const columns: { label: string; key: SortKey; align?: "left" | "right" }[] = [
    { label: "Label", key: "label", align: "left" },
    { label: "Entries", key: "entries", align: "right" },
    { label: "Total Time", key: "totalTime", align: "right" },
    { label: "Share", key: "share", align: "right" },
  ];

  return (
    <div className="bg-surface-container-lowest rounded-xl paper-shadow overflow-hidden">
      <div className="px-6 py-4 bg-[#f5f4ef]">
        <h3
          className="text-sm font-semibold text-[#31332f]"
          style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
        >
          {title}
        </h3>
      </div>

      <table className="w-full">
        <thead>
          <tr className="bg-[#f5f4ef]">
            {columns.map((column) => (
              <th
                key={column.key}
                onClick={() => handleSort(column.key)}
                className={`px-4 py-3 text-xs font-semibold text-[#5e605b] uppercase tracking-wide cursor-pointer select-none hover:text-[#31332f] ${
                  column.align === "right" ? "text-right" : "text-left"
                } ${column.key === "label" ? "px-6" : ""} ${column.key === "share" ? "w-48 px-6" : ""}`}
                style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
              >
                <span className={`inline-flex items-center gap-1 ${column.align === "right" ? "justify-end" : ""}`}>
                  {column.label}
                  {sortKey === column.key && (
                    <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>
                      {sortDir === "asc" ? "arrow_upward" : "arrow_downward"}
                    </span>
                  )}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row, i) => {
            const pct = totalMs > 0 ? Math.round((row.totalMs / totalMs) * 100) : 0;
            const isEven = i % 2 === 0;

            return (
              <tr
                key={`${row.label}-${row.sortDate ?? "na"}`}
                className={`${isEven ? "" : "bg-[#fbf9f5]"} hover:bg-[#f5f4ef] transition-colors`}
              >
                <td className="px-6 py-3.5">
                  <span
                    className="text-sm font-medium text-[#31332f]"
                    style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                  >
                    {row.label}
                  </span>
                </td>
                <td className="px-4 py-3.5 text-right">
                  <span
                    className="text-sm text-[#5e605b] tabular-nums"
                    style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                  >
                    {row.entryCount}
                  </span>
                </td>
                <td className="px-4 py-3.5 text-right">
                  <span
                    className="text-sm font-medium italic text-[#31332f] tabular-nums"
                    style={{ fontFamily: "var(--font-newsreader, 'Newsreader'), serif" }}
                  >
                    {formatDurationHuman(row.totalMs)}
                  </span>
                </td>
                <td className="px-6 py-3.5">
                  <div className="flex items-center gap-3 justify-end">
                    <div className="flex-1 max-w-28 h-1.5 bg-[#efeee9] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#366769] rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span
                      className="text-xs text-[#5e605b] tabular-nums w-8 text-right"
                      style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                    >
                      {pct}%
                    </span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="bg-[#f5f4ef]">
            <td className="px-6 py-3">
              <span
                className="text-sm font-semibold text-[#31332f]"
                style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
              >
                Total
              </span>
            </td>
            <td className="px-4 py-3 text-right">
              <span
                className="text-sm font-semibold text-[#31332f] tabular-nums"
                style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
              >
                {rows.reduce((s, r) => s + r.entryCount, 0)}
              </span>
            </td>
            <td className="px-4 py-3 text-right">
              <span
                className="text-sm font-semibold italic text-[#31332f] tabular-nums"
                style={{ fontFamily: "var(--font-newsreader, 'Newsreader'), serif" }}
              >
                {formatDurationHuman(totalMs)}
              </span>
            </td>
            <td className="px-6 py-3" />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
