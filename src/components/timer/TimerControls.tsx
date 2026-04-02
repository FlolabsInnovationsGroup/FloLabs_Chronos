"use client";

import { useEffect, useState } from "react";
import { useTimer } from "@/hooks/use-timer";
import { Button } from "@/components/ui/Button";
import { DropdownSelect } from "@/components/ui/DropdownSelect";
import { TagMultiSelect, type TagOption } from "@/components/ui/TagMultiSelect";
import type { Project, Tag } from "@/types";

interface TimerControlsProps {
  projects: Project[];
  tags: Tag[];
}

export function TimerControls({ projects, tags: initialTags }: TimerControlsProps) {
  const { activeTimer, start, update, stop, loading } = useTimer();

  const [description, setDescription] = useState("");
  const [descriptionSaving, setDescriptionSaving] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [localTags, setLocalTags] = useState<TagOption[]>(
    initialTags.map((t) => ({ id: t.id, name: t.name }))
  );
  const [submitting, setSubmitting] = useState(false);
  const [tagSaving, setTagSaving] = useState(false);

  useEffect(() => {
    if (activeTimer) {
      setSelectedTagIds(Array.isArray(activeTimer.tagIds) ? activeTimer.tagIds : []);
      setDescription(activeTimer.description ?? "");
    }
  }, [activeTimer]);

  const selectedProject = projects.find((p) => p.id === selectedProjectId);

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
      setLocalTags((prev) => [...prev, opt].sort((a, b) => a.name.localeCompare(b.name)));
      return opt;
    } catch {
      return null;
    }
  }

  async function handleStart() {
    if (!selectedProjectId) return;
    setSubmitting(true);
    try {
      await start({
        projectId: selectedProjectId,
        tagIds: selectedTagIds,
        description,
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUpdateTags(nextTagIds: string[]) {
    setSelectedTagIds(nextTagIds);
    if (!activeTimer) return;

    setTagSaving(true);
    try {
      await update({ tagIds: nextTagIds });
    } finally {
      setTagSaving(false);
    }
  }

  async function handleCreateWhileActive(name: string): Promise<TagOption | null> {
    const created = await createTag(name);
    if (!created) return null;

    if (activeTimer) {
      const nextTagIds = [...selectedTagIds, created.id];
      await handleUpdateTags(nextTagIds);
    }

    return created;
  }

  async function handleStop() {
    setSubmitting(true);
    try {
      if (activeTimer && description !== (activeTimer.description ?? "")) {
        await handleDescriptionPersist(description);
      }
      await stop(false);
      setDescription("");
      setSelectedProjectId("");
      setSelectedTagIds([]);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDescriptionPersist(nextDescription: string) {
    if (!activeTimer) return;

    setDescriptionSaving(true);
    try {
      await update({ description: nextDescription, tagIds: selectedTagIds });
    } finally {
      setDescriptionSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-4 animate-pulse">
        <div className="h-14 bg-[#f5f4ef] rounded-xl" />
        <div className="flex gap-2">
          <div className="h-9 w-32 bg-[#f5f4ef] rounded-full" />
          <div className="h-9 w-24 bg-[#f5f4ef] rounded-full" />
        </div>
      </div>
    );
  }

  if (!activeTimer && projects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-3 rounded-xl bg-[#f5f4ef]">
        <span className="material-symbols-outlined text-[#b2b2ad]" style={{ fontSize: "32px" }}>
          folder_open
        </span>
        <p
          className="text-sm text-[#5e605b] text-center"
          style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
        >
          Create your first project to start tracking time.
        </p>
        <a
          href="/projects"
          className="text-sm font-medium text-[#366769] hover:underline"
          style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
        >
          Go to Projects →
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => {
            if (activeTimer && description !== (activeTimer.description ?? "")) {
              void handleDescriptionPersist(description);
            }
          }}
          onKeyDown={(e) => {
            if (!activeTimer && e.key === "Enter" && selectedProjectId) void handleStart();
            if (activeTimer && e.key === "Enter") {
              e.currentTarget.blur();
            }
          }}
          placeholder="What are you working on?"
          className="w-full bg-transparent text-2xl italic text-[#31332f] placeholder:text-[#b2b2ad] outline-none py-2 border-b-2 border-[#efeee9] focus:border-[#366769] transition-colors"
          style={{ fontFamily: "var(--font-newsreader, 'Newsreader'), serif" }}
        />
        {activeTimer && !description.trim() && (
          <p className="text-xs text-[#a73b21]" style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}>
            Add a description to stop this timer.
          </p>
        )}
        {activeTimer && descriptionSaving && (
          <p className="text-xs text-[#366769]" style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}>
            Saving description…
          </p>
        )}
      </div>

      {!activeTimer && (
        <div className="flex flex-wrap gap-2 items-start">
          <DropdownSelect
            value={selectedProjectId}
            onChange={setSelectedProjectId}
            placeholder="Select project"
            leadingIcon={selectedProject ? undefined : "folder_open"}
            leadingIconColor="#366769"
            options={projects.map((p) => ({
              value: p.id,
              label: p.name,
              color: p.color ?? "#366769",
            }))}
            className="min-w-[160px]"
          />

          <TagMultiSelect
            value={selectedTagIds}
            onChange={setSelectedTagIds}
            options={localTags}
            onCreate={createTag}
            placeholder="Add tags…"
            className="flex-1 min-w-[160px]"
          />
        </div>
      )}

      {activeTimer && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            {(() => {
              const proj = projects.find((p) => p.id === activeTimer.projectId);
              return (
                <>
                  {proj && (
                    <span
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm bg-[#b9ecee] text-[#104648]"
                      style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                    >
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: proj.color ?? "#366769" }}
                      />
                      {proj.name}
                    </span>
                  )}
                </>
              );
            })()}
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <p
                className="text-xs uppercase tracking-wide text-[#5e605b] font-medium"
                style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
              >
                Tags for current session
              </p>
              {tagSaving && (
                <span
                  className="text-xs text-[#366769]"
                  style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                >
                  Saving…
                </span>
              )}
            </div>
            <TagMultiSelect
              value={selectedTagIds}
              onChange={(ids) => void handleUpdateTags(ids)}
              options={localTags}
              onCreate={handleCreateWhileActive}
              placeholder="Add tags to running timer…"
              className="flex-1"
              disabled={submitting || tagSaving}
            />
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 pt-2">
        {!activeTimer ? (
          <Button
            variant="primary"
            size="lg"
            onClick={handleStart}
            loading={submitting}
            disabled={!selectedProjectId}
          >
            <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>
              play_arrow
            </span>
            Start Session
          </Button>
        ) : (
          <Button variant="primary" size="lg" onClick={handleStop} loading={submitting} disabled={!description.trim() || descriptionSaving}>
            <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>
              stop
            </span>
            Stop Session
          </Button>
        )}
      </div>
    </div>
  );
}
