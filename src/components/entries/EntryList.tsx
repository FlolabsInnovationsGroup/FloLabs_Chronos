"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { groupEntriesByDate, formatDuration } from "@/lib/utils";
import { EntryCard } from "./EntryCard";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { DropdownSelect } from "@/components/ui/DropdownSelect";
import type { TimeEntry } from "@/types";

interface ProjectOption {
  id: string;
  name: string;
}

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
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Bulk delete state
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [bulkDeleteLoading, setBulkDeleteLoading] = useState(false);

  // Bulk change project state
  const [changeProjectOpen, setChangeProjectOpen] = useState(false);
  const [changeProjectLoading, setChangeProjectLoading] = useState(false);
  const [projectOptions, setProjectOptions] = useState<ProjectOption[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [projectsLoaded, setProjectsLoaded] = useState(false);

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelectedIds(new Set(entries.map((e) => e.id)));
  }

  function deselectAll() {
    setSelectedIds(new Set());
  }

  async function openChangeProject() {
    if (!projectsLoaded) {
      try {
        const res = await fetch("/api/projects");
        const data = await res.json();
        setProjectOptions((data.projects as ProjectOption[]) ?? []);
        setProjectsLoaded(true);
      } catch {
        // ignore load errors
      }
    }
    setSelectedProjectId("");
    setChangeProjectOpen(true);
  }

  async function handleBulkDelete() {
    setBulkDeleteLoading(true);
    try {
      await fetch("/api/entries/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", entryIds: Array.from(selectedIds) }),
      });
      setSelectedIds(new Set());
      setBulkDeleteConfirm(false);
      router.refresh();
    } catch {
      // ignore
    } finally {
      setBulkDeleteLoading(false);
    }
  }

  async function handleBulkChangeProject() {
    if (!selectedProjectId) return;
    setChangeProjectLoading(true);
    try {
      await fetch("/api/entries/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "changeProject",
          entryIds: Array.from(selectedIds),
          projectId: selectedProjectId,
        }),
      });
      setSelectedIds(new Set());
      setChangeProjectOpen(false);
      router.refresh();
    } catch {
      // ignore
    } finally {
      setChangeProjectLoading(false);
    }
  }

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
  const anySelected = selectedIds.size > 0;
  const allSelected = selectedIds.size === entries.length;

  return (
    <>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between px-4 py-2 rounded-xl bg-[#f5f4ef]">
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={() => (allSelected ? deselectAll() : selectAll())}
              className="w-4 h-4 rounded accent-[#366769]"
            />
            <span
              className="text-sm font-medium text-[#31332f]"
              style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
            >
              Select all entries
            </span>
          </label>
          <span
            className="text-xs text-[#5e605b]"
            style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
          >
            {selectedIds.size} selected
          </span>
        </div>
        {groups.map((group) => {
          const groupTotalMs = group.entries.reduce((sum, e) => sum + (e.durationMs ?? 0), 0);

          return (
            <div key={group.date} className="flex flex-col gap-1">
              {/* Date group header */}
              <div className="flex items-center justify-between px-4 py-2">
                <div className="flex items-center gap-3">
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
                  <EntryCard
                    key={entry.id}
                    entry={entry}
                    onResume={onResume}
                    isSelected={selectedIds.has(entry.id)}
                    onToggleSelect={toggleSelect}
                    anySelected={anySelected}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Floating bulk action bar */}
      {anySelected && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-5 py-3 bg-[#31332f] rounded-2xl shadow-2xl">
          <span
            className="text-sm font-medium text-[#e3feff]"
            style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
          >
            {selectedIds.size} selected
          </span>
          <div className="w-px h-4 bg-[#e3feff]/20" />
          <button
            onClick={allSelected ? deselectAll : selectAll}
            className="text-sm text-[#abdddf] hover:text-[#e3feff] transition-colors"
            style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
          >
            {allSelected ? "Deselect all" : "Select all"}
          </button>
          <div className="w-px h-4 bg-[#e3feff]/20" />
          <button
            onClick={openChangeProject}
            className="text-sm text-[#abdddf] hover:text-[#e3feff] transition-colors"
            style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
          >
            Change project
          </button>
          <button
            onClick={() => setBulkDeleteConfirm(true)}
            className="text-sm text-[#f09b84] hover:text-[#fde0d9] transition-colors"
            style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
          >
            Delete ({selectedIds.size})
          </button>
          <button
            onClick={deselectAll}
            className="p-1 rounded text-[#e3feff]/50 hover:text-[#e3feff] transition-colors"
            aria-label="Clear selection"
          >
            <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>
              close
            </span>
          </button>
        </div>
      )}

      {/* Bulk delete confirmation modal */}
      <Modal
        open={bulkDeleteConfirm}
        onClose={() => setBulkDeleteConfirm(false)}
        title="Delete entries"
        size="sm"
      >
        <div className="flex flex-col gap-4">
          <p
            className="text-sm text-[#5e605b]"
            style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
          >
            Delete {selectedIds.size} {selectedIds.size === 1 ? "entry" : "entries"}? This cannot be
            undone.
          </p>
          <div className="flex gap-2 justify-end">
            <Button variant="primary" size="sm" onClick={() => setBulkDeleteConfirm(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              loading={bulkDeleteLoading}
              onClick={handleBulkDelete}
            >
              Delete
            </Button>
          </div>
        </div>
      </Modal>

      {/* Bulk change project modal */}
      <Modal
        open={changeProjectOpen}
        onClose={() => setChangeProjectOpen(false)}
        title="Change project"
        size="sm"
      >
        <div className="flex flex-col gap-4">
          <DropdownSelect
            value={selectedProjectId}
            onChange={setSelectedProjectId}
            options={[
              { value: "", label: "Select a project…" },
              ...projectOptions.map((p) => ({ value: p.id, label: p.name })),
            ]}
            placeholder="Select a project…"
          />
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={() => setChangeProjectOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={changeProjectLoading}
              disabled={!selectedProjectId}
              onClick={handleBulkChangeProject}
            >
              Apply to {selectedIds.size} {selectedIds.size === 1 ? "entry" : "entries"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
