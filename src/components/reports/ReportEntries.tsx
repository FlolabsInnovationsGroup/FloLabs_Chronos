"use client";

import { useMemo, useState } from "react";
import { EntryList } from "@/components/entries/EntryList";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import type { TimeEntry } from "@/types";

interface ReportEntriesProps {
  entries: TimeEntry[];
  viewerRole?: string;
  viewerId?: string;
}

type SortKey = "duration" | "project" | "tags" | "date" | "description" | "user";
type SortDir = "asc" | "desc";

export function ReportEntries({ entries, viewerRole, viewerId }: ReportEntriesProps) {
  const [expanded, setExpanded] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Discussion modal state
  const [discussEntry, setDiscussEntry] = useState<TimeEntry | null>(null);
  const [discussOpen, setDiscussOpen] = useState(false);
  const [discussMsg, setDiscussMsg] = useState("");
  const [discussLoading, setDiscussLoading] = useState(false);
  const [discussError, setDiscussError] = useState("");
  const [discussSuccess, setDiscussSuccess] = useState(false);

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

  async function handleDiscussSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!discussEntry || !discussMsg.trim()) return;
    setDiscussLoading(true);
    setDiscussError("");
    try {
      const res = await fetch("/api/discussions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryId: discussEntry.id, message: discussMsg.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        setDiscussError(data.error ?? "Failed to start discussion");
      } else {
        setDiscussOpen(false);
        setDiscussMsg("");
        setDiscussSuccess(true);
        setTimeout(() => setDiscussSuccess(false), 2000);
      }
    } catch {
      setDiscussError("Network error");
    } finally {
      setDiscussLoading(false);
    }
  }

  return (
    <>
      {discussSuccess && (
        <div className="fixed top-4 right-4 z-50 px-4 py-2 rounded-lg bg-primary text-on-primary text-sm shadow-lg" style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}>
          Discussion started
        </div>
      )}

      <div className="bg-surface-container-lowest rounded-xl paper-shadow">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className={`w-full flex items-center justify-between px-6 py-4 bg-surface-container-low hover:bg-surface-container transition-colors cursor-pointer ${
            expanded ? "rounded-t-xl" : "rounded-xl"
          }`}
        >
          <div className="flex items-center gap-3">
            <h3
              className="text-sm font-semibold text-on-background"
              style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
            >
              Detailed Entries
            </h3>
            <span
              className="text-xs text-outline-variant"
              style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
            >
              {entries.length} {entries.length === 1 ? "entry" : "entries"}
            </span>
          </div>
          <span
            className="material-symbols-outlined text-on-surface-variant transition-transform duration-200"
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
            <div className="flex flex-col gap-2 px-4 py-3 rounded-xl bg-surface-container-low sm:flex-row sm:flex-wrap sm:items-center">
              <span
                className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant"
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
                      ? "border-sort-border bg-surface-container-lowest text-on-background"
                      : "border-transparent bg-transparent text-on-surface-variant hover:text-on-background"
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
              onDiscuss={(entry) => { setDiscussEntry(entry); setDiscussMsg(""); setDiscussOpen(true); }}
              viewerRole={viewerRole}
              viewerId={viewerId}
            />
          </div>
        )}
      </div>

      <Modal open={discussOpen} onClose={() => setDiscussOpen(false)} title="Start discussion" size="md">
        <form onSubmit={handleDiscussSubmit} className="flex flex-col gap-4">
          {discussEntry && (
            <div className="flex flex-col gap-1">
              <p className="text-sm italic text-on-surface-variant" style={{ fontFamily: "var(--font-newsreader, 'Newsreader'), serif" }}>
                {discussEntry.description || "No description"}
              </p>
              {discussEntry.project?.name && (
                <span className="inline-flex items-center gap-1 text-xs text-primary font-medium" style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}>
                  <span className="material-symbols-outlined" style={{ fontSize: "12px" }}>folder</span>
                  {discussEntry.project.name}
                </span>
              )}
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-on-surface-variant uppercase tracking-wide" style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}>
              Message
            </label>
            <textarea
              value={discussMsg}
              onChange={(e) => setDiscussMsg(e.target.value)}
              rows={3}
              required
              placeholder="What needs to be discussed about this entry?"
              className="w-full rounded-lg border border-surface-container-highest bg-surface-container-lowest px-3 py-2 text-sm text-on-background resize-none focus:outline-none focus:ring-2 focus:ring-primary"
              style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
            />
          </div>
          {discussError && (
            <p className="text-sm text-error" style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}>
              {discussError}
            </p>
          )}
          <div className="flex gap-2 justify-end pt-1">
            <Button type="button" variant="ghost" size="md" onClick={() => setDiscussOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary" size="md" loading={discussLoading} disabled={!discussMsg.trim()}>Start discussion</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
