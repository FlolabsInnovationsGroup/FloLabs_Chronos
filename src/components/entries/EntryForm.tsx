"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
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
  const [tagId, setTagId] = useState(entry?.tagId ?? "");
  const [startedAt, setStartedAt] = useState(toDatetimeLocal(entry?.startedAt));
  const [stoppedAt, setStoppedAt] = useState(toDatetimeLocal(entry?.stoppedAt));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

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
      const payload = {
        projectId,
        tagId: tagId || null,
        description,
        startedAt: start.toISOString(),
        stoppedAt: stop.toISOString(),
        durationMs: stop.getTime() - start.getTime(),
      };

      const res = await fetch(
        isEdit ? `/api/entries/${entry!.id}` : "/api/entries",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      if (!res.ok) throw new Error("Failed to save entry");

      onSaved?.();
      onClose();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const projectOptions = projects.map((p) => ({ value: p.id, label: p.name }));
  const tagOptions = [
    { value: "", label: "No tag" },
    ...tags.map((t) => ({ value: t.id, label: t.name })),
  ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? "Edit Time Entry" : "Log Time Entry"}
      size="md"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input
          label="Description"
          placeholder="What were you working on?"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        <Select
          label="Project"
          options={projectOptions}
          value={projectId}
          onChange={setProjectId}
          placeholder="Select a project"
        />

        <Select
          label="Tag"
          options={tagOptions}
          value={tagId}
          onChange={setTagId}
        />

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Start Time"
            type="datetime-local"
            value={startedAt}
            onChange={(e) => setStartedAt(e.target.value)}
          />
          <Input
            label="End Time"
            type="datetime-local"
            value={stoppedAt}
            onChange={(e) => setStoppedAt(e.target.value)}
          />
        </div>

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
