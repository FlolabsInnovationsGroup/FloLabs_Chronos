import { formatDurationHuman } from "@/lib/utils";
import type { ReportRow } from "@/types";

interface ReportTableProps {
  rows: ReportRow[];
  title?: string;
}

export function ReportTable({ rows, title = "Breakdown" }: ReportTableProps) {
  const totalMs = rows.reduce((sum, r) => sum + r.totalMs, 0);

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

  return (
    <div className="bg-surface-container-lowest rounded-xl paper-shadow overflow-hidden">
      {/* Table header */}
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
            <th
              className="text-left px-6 py-3 text-xs font-semibold text-[#5e605b] uppercase tracking-wide"
              style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
            >
              Label
            </th>
            <th
              className="text-right px-4 py-3 text-xs font-semibold text-[#5e605b] uppercase tracking-wide"
              style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
            >
              Entries
            </th>
            <th
              className="text-right px-4 py-3 text-xs font-semibold text-[#5e605b] uppercase tracking-wide"
              style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
            >
              Total Time
            </th>
            <th
              className="text-right px-6 py-3 text-xs font-semibold text-[#5e605b] uppercase tracking-wide w-48"
              style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
            >
              Share
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const pct = totalMs > 0 ? Math.round((row.totalMs / totalMs) * 100) : 0;
            const isEven = i % 2 === 0;

            return (
              <tr
                key={row.label}
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
        {/* Footer total */}
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
