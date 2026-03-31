"use client";

import { Button } from "@/components/ui/Button";
import type { TimeEntry } from "@/types";

interface ExportCSVButtonProps {
  entries: TimeEntry[];
}

function buildCSV(entries: TimeEntry[]): string {
  const header = "Date,User,Project,Tags,Description,Duration (h)";
  const rows = entries.map((e) => {
    const date = new Date(e.startedAt).toLocaleDateString("en-US");
    const user = `"${(e.user?.name ?? "").replace(/"/g, '""')}"`;
    const project = `"${(e.project?.name ?? "").replace(/"/g, '""')}"`;
    const tagNames = (e.tags ?? []).map((t) => t.name).join("; ");
    const tags = `"${tagNames.replace(/"/g, '""')}"`;
    const description = `"${(e.description ?? "").replace(/"/g, '""')}"`;
    const duration = e.durationMs ? (e.durationMs / 3_600_000).toFixed(2) : "";
    return [date, user, project, tags, description, duration].join(",");
  });
  return [header, ...rows].join("\n");
}

export function ExportCSVButton({ entries }: ExportCSVButtonProps) {
  const handleExport = () => {
    const csv = buildCSV(entries);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "flchron-report.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Button variant="secondary" size="sm" onClick={handleExport}>
      <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>
        download
      </span>
      Export CSV
    </Button>
  );
}
