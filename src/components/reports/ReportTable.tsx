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
          className="text-sm text-outline-variant text-center py-8"
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
      <div className="px-6 py-4 bg-surface-container-low">
        <h3
          className="text-sm font-semibold text-on-background"
          style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
        >
          {title}
        </h3>
      </div>

      <div className="md:hidden px-4 py-4 flex flex-col gap-3">
        {sortedRows.map((row) => {
          const pct = totalMs > 0 ? Math.round((row.totalMs / totalMs) * 100) : 0;

          return (
            <div key={`${row.label}-${row.sortDate ?? "na"}`} className="rounded-xl bg-background p-4 flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p
                    className="text-xs uppercase tracking-wide text-on-surface-variant"
                    style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                  >
                    Label
                  </p>
                  <p
                    className="text-sm font-medium text-on-background mt-1"
                    style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                  >
                    {row.label}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p
                    className="text-xs uppercase tracking-wide text-on-surface-variant"
                    style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                  >
                    Share
                  </p>
                  <p
                    className="text-sm font-medium text-on-background mt-1 tabular-nums"
                    style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                  >
                    {pct}%
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-surface-container-lowest/70 px-3 py-2">
                  <p
                    className="text-xs uppercase tracking-wide text-on-surface-variant"
                    style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                  >
                    Entries
                  </p>
                  <p
                    className="text-sm text-on-background mt-1 tabular-nums"
                    style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                  >
                    {row.entryCount}
                  </p>
                </div>
                <div className="rounded-lg bg-surface-container-lowest/70 px-3 py-2">
                  <p
                    className="text-xs uppercase tracking-wide text-on-surface-variant"
                    style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                  >
                    Total Time
                  </p>
                  <p
                    className="text-sm font-medium italic text-on-background mt-1 tabular-nums"
                    style={{ fontFamily: "var(--font-newsreader, 'Newsreader'), serif" }}
                  >
                    {formatDurationHuman(row.totalMs)}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex-1 h-1.5 bg-surface-container rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
                <span
                  className="text-xs text-on-surface-variant tabular-nums w-8 text-right"
                  style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                >
                  {pct}%
                </span>
              </div>
            </div>
          );
        })}

        <div className="rounded-xl bg-surface-container-low p-4 grid grid-cols-2 gap-3">
          <div>
            <p
              className="text-xs uppercase tracking-wide text-on-surface-variant"
              style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
            >
              Total Entries
            </p>
            <p
              className="text-sm font-semibold text-on-background mt-1 tabular-nums"
              style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
            >
              {rows.reduce((s, r) => s + r.entryCount, 0)}
            </p>
          </div>
          <div>
            <p
              className="text-xs uppercase tracking-wide text-on-surface-variant"
              style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
            >
              Total Time
            </p>
            <p
              className="text-sm font-semibold italic text-on-background mt-1 tabular-nums"
              style={{ fontFamily: "var(--font-newsreader, 'Newsreader'), serif" }}
            >
              {formatDurationHuman(totalMs)}
            </p>
          </div>
        </div>
      </div>

      <table className="hidden md:table w-full">
        <thead>
          <tr className="bg-surface-container-low">
            {columns.map((column) => (
              <th
                key={column.key}
                onClick={() => handleSort(column.key)}
                className={`px-4 py-3 text-xs font-semibold text-on-surface-variant uppercase tracking-wide cursor-pointer select-none hover:text-on-background ${
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
                className={`${isEven ? "" : "bg-background"} hover:bg-surface-container-low transition-colors`}
              >
                <td className="px-6 py-3.5">
                  <span
                    className="text-sm font-medium text-on-background"
                    style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                  >
                    {row.label}
                  </span>
                </td>
                <td className="px-4 py-3.5 text-right">
                  <span
                    className="text-sm text-on-surface-variant tabular-nums"
                    style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                  >
                    {row.entryCount}
                  </span>
                </td>
                <td className="px-4 py-3.5 text-right">
                  <span
                    className="text-sm font-medium italic text-on-background tabular-nums"
                    style={{ fontFamily: "var(--font-newsreader, 'Newsreader'), serif" }}
                  >
                    {formatDurationHuman(row.totalMs)}
                  </span>
                </td>
                <td className="px-6 py-3.5">
                  <div className="flex items-center gap-3 justify-end">
                    <div className="flex-1 max-w-28 h-1.5 bg-surface-container rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span
                      className="text-xs text-on-surface-variant tabular-nums w-8 text-right"
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
          <tr className="bg-surface-container-low">
            <td className="px-6 py-3">
              <span
                className="text-sm font-semibold text-on-background"
                style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
              >
                Total
              </span>
            </td>
            <td className="px-4 py-3 text-right">
              <span
                className="text-sm font-semibold text-on-background tabular-nums"
                style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
              >
                {rows.reduce((s, r) => s + r.entryCount, 0)}
              </span>
            </td>
            <td className="px-4 py-3 text-right">
              <span
                className="text-sm font-semibold italic text-on-background tabular-nums"
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
