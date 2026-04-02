"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { TagMultiSelect, type TagOption } from "@/components/ui/TagMultiSelect";
import { Tooltip } from "@/components/ui/Tooltip";
import { formatDuration, formatTime } from "@/lib/utils";
import type { TimeEntry } from "@/types";

interface Project {
  id: string;
  name: string;
  color: string;
  icon: string;
}

interface EntryCardProps {
  entry: TimeEntry;
  onResume?: (entry: TimeEntry) => void;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
  anySelected?: boolean;
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function toDatetimeLocal(value: Date | string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

export function EntryCard({ entry, onResume, isSelected = false, onToggleSelect, anySelected = false }: EntryCardProps) {
  const router = useRouter();
  const [hovered, setHovered] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editDesc, setEditDesc] = useState(entry.description ?? "");
  const [editProjectId, setEditProjectId] = useState(entry.projectId ?? "");
  const [editTagIds, setEditTagIds] = useState<string[]>((entry.tags ?? []).map((t) => t.id));
  const [editStartedAt, setEditStartedAt] = useState(toDatetimeLocal(entry.startedAt));
  const [editStoppedAt, setEditStoppedAt] = useState(toDatetimeLocal(entry.stoppedAt));
  const [timeFieldSelection, setTimeFieldSelection] = useState<"start" | "end" | null>(entry.editedField);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [tagOptions, setTagOptions] = useState<TagOption[]>((entry.tags ?? []).map((t) => ({ id: t.id, name: t.name })));
  const [optionsLoaded, setOptionsLoaded] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const duration = entry.durationMs ? formatDuration(entry.durationMs) : "--:--:--";
  const startTime = formatTime(entry.startedAt);
  const endTime = entry.stoppedAt ? formatTime(entry.stoppedAt) : "running";
  const projectColor = entry.project?.color ?? "#366769";
  const projectName = entry.project?.name ?? "Unknown";
  const entryTags = entry.tags ?? [];

  async function openEdit() {
    setEditDesc(entry.description ?? "");
    setEditProjectId(entry.projectId ?? "");
    setEditTagIds((entry.tags ?? []).map((t) => t.id));
    setEditStartedAt(toDatetimeLocal(entry.startedAt));
    setEditStoppedAt(toDatetimeLocal(entry.stoppedAt));
    setTimeFieldSelection(entry.editedField);
    setEditError("");
    setEditOpen(true);

    if (!optionsLoaded) {
      try {
        const [projRes, tagRes] = await Promise.all([fetch("/api/projects"), fetch("/api/tags")]);
        const [projData, tagData] = await Promise.all([projRes.json(), tagRes.json()]);
        setProjects(projData.projects ?? []);
        const fetchedTags: TagOption[] = (tagData.tags ?? []).map((t: { id: string; name: string }) => ({ id: t.id, name: t.name }));
        const merged = [...fetchedTags];
        for (const et of entry.tags ?? []) {
          if (!merged.find((x) => x.id === et.id)) merged.push({ id: et.id, name: et.name });
        }
        setTagOptions(merged);
        setOptionsLoaded(true);
      } catch {}
    }
  }

  async function createTag(name: string): Promise<TagOption | null> {
    try {
      const res = await fetch("/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) return null;
      const { tag } = await res.json();
      const opt: TagOption = { id: tag.id, name: tag.name };
      setTagOptions((prev) => [...prev, opt].sort((a, b) => a.name.localeCompare(b.name)));
      return opt;
    } catch {
      return null;
    }
  }

  const originalStartedAt = useMemo(() => toDatetimeLocal(entry.startedAt), [entry.startedAt]);
  const originalStoppedAt = useMemo(() => toDatetimeLocal(entry.stoppedAt), [entry.stoppedAt]);

  const lockedStart = timeFieldSelection === "end";
  const lockedEnd = timeFieldSelection === "start";

  function selectTimeField(field: "start" | "end") {
    if (entry.editedField && entry.editedField !== field) return;
    setTimeFieldSelection((current) => current ?? field);
  }

  async function handleEditSave(e: React.FormEvent) {
    e.preventDefault();
    setEditLoading(true);
    setEditError("");
    try {
      const payload: Record<string, unknown> = {
        description: editDesc,
        projectId: editProjectId || undefined,
        tagIds: editTagIds,
      };

      if (timeFieldSelection === "start" && editStartedAt && editStartedAt !== originalStartedAt) {
        payload.startedAt = new Date(editStartedAt).toISOString();
      }
      if (timeFieldSelection === "end" && editStoppedAt && editStoppedAt !== originalStoppedAt) {
        payload.stoppedAt = new Date(editStoppedAt).toISOString();
      }

      const res = await fetch(`/api/entries/${entry.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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
    } finally {
      setDeleteLoading(false);
    }
  }

  return (
    <>
      <div className="group flex items-center gap-4 px-4 py-3.5 rounded-xl hover:bg-[#f5f4ef] transition-colors duration-150 cursor-default" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
        {onToggleSelect && <div className={`shrink-0 transition-opacity duration-150 ${anySelected || hovered ? "opacity-100" : "opacity-0"}`}><input type="checkbox" checked={isSelected} onChange={() => onToggleSelect(entry.id)} onClick={(e) => e.stopPropagation()} className="w-4 h-4 rounded cursor-pointer accent-[#366769]" aria-label="Select entry" /></div>}
        <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${projectColor}20` }}><span className="material-symbols-outlined" style={{ fontSize: "18px", color: projectColor }}>{entry.project?.icon ?? "timer"}</span></div>
        <div className="flex-1 min-w-0 flex flex-col gap-1"><p className="text-base italic text-[#31332f] truncate" style={{ fontFamily: "var(--font-newsreader, 'Newsreader'), serif" }}>{entry.description || <span className="text-[#b2b2ad] not-italic">No description</span>}</p><div className="flex items-center gap-2 flex-wrap"><Badge color="primary" dot dotColor={projectColor}>{projectName}</Badge>{entryTags.map((tag) => <Badge key={tag.id} color="tertiary"><span className="material-symbols-outlined mr-0.5" style={{ fontSize: "11px" }}>label</span>{tag.name}</Badge>)}<span className="text-xs text-[#b2b2ad]" style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}>{startTime} – {endTime}</span></div></div>
        <div className="flex items-center gap-1 shrink-0">
          {onResume && <Tooltip label="Resume"><button onClick={() => onResume(entry)} className={`p-1.5 rounded-lg text-[#366769] hover:bg-[#b9ecee] transition-all duration-150 ${hovered ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`} aria-label="Resume this entry"><span className="material-symbols-outlined" style={{ fontSize: "18px" }}>play_arrow</span></button></Tooltip>}
          <Tooltip label="Edit"><button onClick={openEdit} className={`p-1.5 rounded-lg text-[#5e605b] hover:bg-[#f5f4ef] transition-all duration-150 ${hovered ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`} aria-label="Edit this entry"><span className="material-symbols-outlined" style={{ fontSize: "18px" }}>edit</span></button></Tooltip>
          <Tooltip label="Delete"><button onClick={() => setDeleteConfirm(true)} className={`p-1.5 rounded-lg text-[#a73b21] hover:bg-[#fde0d9] transition-all duration-150 ${hovered ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`} aria-label="Delete this entry"><span className="material-symbols-outlined" style={{ fontSize: "18px" }}>delete</span></button></Tooltip>
          <span className="text-xl font-light italic text-[#31332f] tabular-nums min-w-[5.5rem] text-right ml-2" style={{ fontFamily: "var(--font-newsreader, 'Newsreader'), serif" }}>{duration}</span>
        </div>
      </div>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit entry" size="md">
        <form onSubmit={handleEditSave} className="flex flex-col gap-4">
          <Input label="Description" value={editDesc} onChange={(e) => setEditDesc(e.target.value)} placeholder="What were you working on?" />
          {projects.length > 0 && <Select label="Project" value={editProjectId} onChange={setEditProjectId} options={projects.map((p) => ({ value: p.id, label: p.name }))} placeholder="Select project" />}
          <div className="flex flex-col gap-1.5"><label className="text-xs font-medium text-[#5e605b] uppercase tracking-wide" style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}>Tags</label><TagMultiSelect value={editTagIds} onChange={setEditTagIds} options={tagOptions} onCreate={createTag} placeholder="Add tags…" /></div>
          {!!entry.stoppedAt && (
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-1.5">
                    <label className="text-xs font-medium text-[#5e605b] uppercase tracking-wide" style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}>
                      Start Time
                    </label>
                    {lockedStart && (
                      <Tooltip label={entry.editedField === "end" ? "Locked because end time was already edited" : "Locked while you edit the end time"}>
                        <span className="text-[#8f918b]">🔒</span>
                      </Tooltip>
                    )}
                  </div>
                  <Input
                    type="datetime-local"
                    value={editStartedAt}
                    onFocus={() => selectTimeField("start")}
                    onChange={(e) => {
                      selectTimeField("start");
                      setEditStartedAt(e.target.value);
                    }}
                    disabled={lockedStart}
                    className={lockedStart ? "bg-[#ece9e2] text-[#8f918b]" : undefined}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-1.5">
                    <label className="text-xs font-medium text-[#5e605b] uppercase tracking-wide" style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}>
                      End Time
                    </label>
                    {lockedEnd && (
                      <Tooltip label={entry.editedField === "start" ? "Locked because start time was already edited" : "Locked while you edit the start time"}>
                        <span className="text-[#8f918b]">🔒</span>
                      </Tooltip>
                    )}
                  </div>
                  <Input
                    type="datetime-local"
                    value={editStoppedAt}
                    onFocus={() => selectTimeField("end")}
                    onChange={(e) => {
                      selectTimeField("end");
                      setEditStoppedAt(e.target.value);
                    }}
                    disabled={lockedEnd}
                    className={lockedEnd ? "bg-[#ece9e2] text-[#8f918b]" : undefined}
                  />
                </div>
              </div>

              {!entry.editedField && !timeFieldSelection && (
                <p className="text-xs text-[#7a7c76]" style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}>
                  Choose one boundary to edit. As soon as you select start or end, the other one locks.
                </p>
              )}
            </div>
          )}
          {editError && <p className="text-sm text-[#a73b21]" style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}>{editError}</p>}
          <div className="flex gap-2 justify-end pt-1"><Button type="button" variant="ghost" size="md" onClick={() => setEditOpen(false)}>Cancel</Button><Button type="submit" variant="primary" size="md" loading={editLoading}>Save</Button></div>
        </form>
      </Modal>

      <Modal open={deleteConfirm} onClose={() => setDeleteConfirm(false)} title="Delete entry" size="md"><div className="flex flex-col gap-4"><p className="text-sm text-[#5e605b]" style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}>Are you sure you want to delete this time entry? This cannot be undone.</p><div className="flex gap-2 justify-end"><Button variant="primary" size="md" onClick={() => setDeleteConfirm(false)}>Cancel</Button><Button variant="danger" size="md" loading={deleteLoading} onClick={handleDelete}>Delete</Button></div></div></Modal>
    </>
  );
}


