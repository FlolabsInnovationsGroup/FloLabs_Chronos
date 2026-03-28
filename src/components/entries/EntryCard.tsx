"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { formatDuration, formatTime } from "@/lib/utils";
import type { TimeEntry } from "@/types";

interface Project {
  id: string;
  name: string;
  color: string;
  icon: string;
}

interface Tag {
  id: string;
  name: string;
  color: string;
}

interface EntryCardProps {
  entry: TimeEntry;
  onResume?: (entry: TimeEntry) => void;
}

export function EntryCard({ entry, onResume }: EntryCardProps) {
  const router = useRouter();
  const [hovered, setHovered] = useState(false);

  // Edit state
  const [editOpen, setEditOpen] = useState(false);
  const [editDesc, setEditDesc] = useState(entry.description ?? "");
  const [editProjectId, setEditProjectId] = useState(entry.projectId ?? "");
  const [editTagId, setEditTagId] = useState(entry.tagId ?? "");
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [optionsLoaded, setOptionsLoaded] = useState(false);

  // Delete state
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const duration = entry.durationMs ? formatDuration(entry.durationMs) : "--:--:--";
  const startTime = formatTime(entry.startedAt);
  const endTime = entry.stoppedAt ? formatTime(entry.stoppedAt) : "running";

  const projectColor = entry.project?.color ?? "#366769";
  const projectName = entry.project?.name ?? "Unknown";
  const tagName = entry.tag?.name;
  const tagColor = entry.tag?.color ?? "#755a40";

  async function openEdit() {
    setEditDesc(entry.description ?? "");
    setEditProjectId(entry.projectId ?? "");
    setEditTagId(entry.tagId ?? "");
    setEditError("");
    setEditOpen(true);

    if (!optionsLoaded) {
      try {
        const [projRes, tagRes] = await Promise.all([
          fetch("/api/projects"),
          fetch("/api/tags"),
        ]);
        const [projData, tagData] = await Promise.all([projRes.json(), tagRes.json()]);
        setProjects(projData.projects ?? []);
        setTags(tagData.tags ?? []);
        setOptionsLoaded(true);
      } catch {
        // silently ignore load errors
      }
    }
  }

  async function handleEditSave(e: React.FormEvent) {
    e.preventDefault();
    setEditLoading(true);
    setEditError("");
    try {
      const res = await fetch(`/api/entries/${entry.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: editDesc,
          projectId: editProjectId || undefined,
          tagId: editTagId || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setEditError(data.error ?? "Failed to save");
      } else {
        setEditOpen(false);
        router.refresh();
      }
    } catch {
      setEditError("Network error");
    } finally {
      setEditLoading(false);
    }
  }

  async function handleDelete() {
    setDeleteLoading(true);
    try {
      await fetch(`/api/entries/${entry.id}`, { method: "DELETE" });
      setDeleteConfirm(false);
      router.refresh();
    } catch {
      // ignore
    } finally {
      setDeleteLoading(false);
    }
  }

  return (
    <>
      <div
        className="group flex items-center gap-4 px-4 py-3.5 rounded-xl hover:bg-[#f5f4ef] transition-colors duration-150 cursor-default"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* Project color icon box */}
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
          style={{ backgroundColor: `${projectColor}20` }}
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: "18px", color: projectColor }}
          >
            {entry.project?.icon ?? "timer"}
          </span>
        </div>

        {/* Description + meta */}
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          <p
            className="text-base italic text-[#31332f] truncate"
            style={{ fontFamily: "var(--font-newsreader, 'Newsreader'), serif" }}
          >
            {entry.description || (
              <span className="text-[#b2b2ad] not-italic">No description</span>
            )}
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Project badge */}
            <Badge color="primary" dot dotColor={projectColor}>
              {projectName}
            </Badge>
            {/* Tag badge */}
            {tagName && (
              <Badge color="tertiary" dot dotColor={tagColor}>
                {tagName}
              </Badge>
            )}
            {/* Time range */}
            <span
              className="text-xs text-[#b2b2ad]"
              style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
            >
              {startTime} – {endTime}
            </span>
          </div>
        </div>

        {/* Duration + actions */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Resume button */}
          {onResume && (
            <button
              onClick={() => onResume(entry)}
              className={`p-1.5 rounded-lg text-[#366769] hover:bg-[#b9ecee] transition-all duration-150 ${
                hovered ? "opacity-100" : "opacity-0 group-hover:opacity-100"
              }`}
              aria-label="Resume this entry"
              title="Resume"
            >
              <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>
                play_arrow
              </span>
            </button>
          )}

          {/* Edit button */}
          <button
            onClick={openEdit}
            className={`p-1.5 rounded-lg text-[#5e605b] hover:bg-[#f5f4ef] transition-all duration-150 ${
              hovered ? "opacity-100" : "opacity-0 group-hover:opacity-100"
            }`}
            aria-label="Edit this entry"
            title="Edit"
          >
            <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>
              edit
            </span>
          </button>

          {/* Delete button */}
          <button
            onClick={() => setDeleteConfirm(true)}
            className={`p-1.5 rounded-lg text-[#a73b21] hover:bg-[#fde0d9] transition-all duration-150 ${
              hovered ? "opacity-100" : "opacity-0 group-hover:opacity-100"
            }`}
            aria-label="Delete this entry"
            title="Delete"
          >
            <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>
              delete
            </span>
          </button>

          {/* Duration */}
          <span
            className="text-xl font-light italic text-[#31332f] tabular-nums min-w-[5.5rem] text-right ml-2"
            style={{ fontFamily: "var(--font-newsreader, 'Newsreader'), serif" }}
          >
            {duration}
          </span>
        </div>
      </div>

      {/* Edit modal */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit entry" size="sm">
        <form onSubmit={handleEditSave} className="flex flex-col gap-4">
          <Input
            label="Description"
            value={editDesc}
            onChange={(e) => setEditDesc(e.target.value)}
            placeholder="What were you working on?"
          />

          {projects.length > 0 && (
            <Select
              label="Project"
              value={editProjectId}
              onChange={setEditProjectId}
              options={projects.map((p) => ({ value: p.id, label: p.name }))}
              placeholder="Select project"
            />
          )}

          {tags.length > 0 && (
            <Select
              label="Tag"
              value={editTagId}
              onChange={setEditTagId}
              options={[
                { value: "", label: "No tag" },
                ...tags.map((t) => ({ value: t.id, label: t.name })),
              ]}
              placeholder="Select tag"
            />
          )}

          {editError && (
            <p
              className="text-sm text-[#a73b21]"
              style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
            >
              {editError}
            </p>
          )}

          <div className="flex gap-2 justify-end pt-1">
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" loading={editLoading}>
              Save
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete confirmation modal */}
      <Modal open={deleteConfirm} onClose={() => setDeleteConfirm(false)} title="Delete entry" size="sm">
        <div className="flex flex-col gap-4">
          <p
            className="text-sm text-[#5e605b]"
            style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
          >
            Are you sure you want to delete this time entry? This cannot be undone.
          </p>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={() => setDeleteConfirm(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              loading={deleteLoading}
              onClick={handleDelete}
            >
              Delete
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
