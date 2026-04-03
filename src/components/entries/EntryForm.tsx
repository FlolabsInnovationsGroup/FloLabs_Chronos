"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { TagMultiSelect, type TagOption } from "@/components/ui/TagMultiSelect";
import { Button } from "@/components/ui/Button";
import { Tooltip } from "@/components/ui/Tooltip";
import { TaskSuggestions, type TaskSuggestion } from "@/components/entries/TaskSuggestions";
import { TaskPicker } from "@/components/entries/TaskPicker";
import type { Project, Tag, TimeEntry } from "@/types";

interface EntryFormProps {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
  entry?: TimeEntry | null;
  projects: Project[];
  tags: Tag[];
}

function toDatetimeLocal(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = new Date(d);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

export function EntryForm({ open, onClose, onSaved, entry, projects, tags }: EntryFormProps) {
  const isEdit = !!entry;

  const [description, setDescription] = useState(entry?.description ?? "");
  const [projectId, setProjectId] = useState(entry?.projectId ?? "");
  const [tagIds, setTagIds] = useState<string[]>((entry?.tags ?? []).map((t) => t.id));
  const [selectedTask, setSelectedTask] = useState<{ id: string; title: string } | null>(
    entry?.notionTaskPageId
      ? { id: entry.notionTaskPageId, title: entry.notionTaskTitle ?? "Untitled task" }
      : null
  );
  const [startedAt, setStartedAt] = useState(toDatetimeLocal(entry?.startedAt));
  const [stoppedAt, setStoppedAt] = useState(toDatetimeLocal(entry?.stoppedAt));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);

  const [tagOptions, setTagOptions] = useState<TagOption[]>(
    tags.map((t) => ({ id: t.id, name: t.name }))
  );

  useEffect(() => {
    if (!open) return;
    setDescription(entry?.description ?? "");
    setProjectId(entry?.projectId ?? "");
    setTagIds((entry?.tags ?? []).map((t) => t.id));
    setSelectedTask(
      entry?.notionTaskPageId
        ? { id: entry.notionTaskPageId, title: entry.notionTaskTitle ?? "Untitled task" }
        : null
    );
    setStartedAt(toDatetimeLocal(entry?.startedAt));
    setStoppedAt(toDatetimeLocal(entry?.stoppedAt));
    setError("");
  }, [entry, open]);

  const editedField = entry?.editedField ?? null;
  const hasStoppedAt = !!entry?.stoppedAt;
  const startLocked = isEdit && editedField === "end";
  const endLocked = isEdit && editedField === "start";

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!projectId) {
      setError("Please select a project.");
      return;
    }
    if (!startedAt || !stoppedAt) {
      setError("Start and end times are required.");
      return;
    }

    const start = new Date(startedAt);
    const stop = new Date(stoppedAt);
    if (stop <= start) {
      setError("End time must be after start time.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const payload: Record<string, unknown> = {
        projectId,
        tagIds,
        description,
        notionTaskPageId: selectedTask?.id ?? null,
        notionTaskTitle: selectedTask?.title ?? null,
      };

      if (!isEdit) {
        payload.startedAt = start.toISOString();
        payload.stoppedAt = stop.toISOString();
        payload.durationMs = stop.getTime() - start.getTime();
      } else {
        if (!startLocked) {
          const origStart = toDatetimeLocal(entry?.startedAt);
          if (startedAt !== origStart) payload.startedAt = start.toISOString();
        }
        if (!endLocked && hasStoppedAt) {
          const origStop = toDatetimeLocal(entry?.stoppedAt);
          if (stoppedAt !== origStop) payload.stoppedAt = stop.toISOString();
        }
      }

      const res = await fetch(
        isEdit ? `/api/entries/${entry!.id}` : "/api/entries",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to save entry");
      }

      onSaved?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const projectOptions = projects.map((p) => ({ value: p.id, label: p.name }));

  function applySuggestion(suggestion: TaskSuggestion) {
    setDescription(suggestion.description);
    setProjectId(suggestion.projectId);
    setTagIds(suggestion.tagIds);
    setSelectedTask(
      suggestion.notionTaskPageId
        ? { id: suggestion.notionTaskPageId, title: suggestion.notionTaskTitle ?? "Untitled task" }
        : null
    );
    setShowSuggestions(false);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? "Edit Time Entry" : "Log Time Entry"}
      size="md"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="relative">
          <Input
            label="Description"
            placeholder="What were you working on?"
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              setShowSuggestions(true);
            }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 120)}
          />
          <TaskSuggestions query={description} open={showSuggestions} onPick={applySuggestion} />
        </div>

        <TaskPicker
          value={selectedTask}
          onChange={setSelectedTask}
          placeholder="Search Notion tasks…"
          label="Task"
          disabled={saving}
        />

        <Select
          label="Project"
          options={projectOptions}
          value={projectId}
          onChange={setProjectId}
          placeholder="Select a project"
        />

        <div className="flex flex-col gap-1.5">
          <label
            className="text-xs font-medium text-[#5e605b] uppercase tracking-wide"
            style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
          >
            Tags
          </label>
          <TagMultiSelect
            value={tagIds}
            onChange={setTagIds}
            options={tagOptions}
            onCreate={createTag}
            placeholder="Add tags…"
          />
        </div>

        {(!isEdit || hasStoppedAt) && (
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-1.5">
                <label
                  className="text-xs font-medium text-[#5e605b] uppercase tracking-wide"
                  style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                >
                  Start Time
                </label>
                {startLocked && (
                  <Tooltip label="Locked — end was already edited" position="top">
                    <span className="text-[#5e605b] cursor-default select-none">🔒</span>
                  </Tooltip>
                )}
              </div>
              <Input
                type="datetime-local"
                value={startedAt}
                onChange={(e) => setStartedAt(e.target.value)}
                disabled={startLocked}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-1.5">
                <label
                  className="text-xs font-medium text-[#5e605b] uppercase tracking-wide"
                  style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                >
                  End Time
                </label>
                {endLocked && (
                  <Tooltip label="Locked — start was already edited" position="top">
                    <span className="text-[#5e605b] cursor-default select-none">🔒</span>
                  </Tooltip>
                )}
              </div>
              <Input
                type="datetime-local"
                value={stoppedAt}
                onChange={(e) => setStoppedAt(e.target.value)}
                disabled={endLocked}
              />
            </div>
          </div>
        )}

        {error && (
          <p
            className="text-sm text-[#a73b21]"
            style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
          >
            {error}
          </p>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" loading={saving}>
            {isEdit ? "Save Changes" : "Log Entry"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
