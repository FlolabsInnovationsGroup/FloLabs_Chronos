"use client";

import { useEffect, useState } from "react";
import { useTimer } from "@/hooks/use-timer";
import { Button } from "@/components/ui/Button";
import { DropdownSelect } from "@/components/ui/DropdownSelect";
import { TagMultiSelect, type TagOption } from "@/components/ui/TagMultiSelect";
import { TaskSuggestions, type TaskSuggestion } from "@/components/entries/TaskSuggestions";
import { TaskPicker } from "@/components/entries/TaskPicker";
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
  const [selectedTask, setSelectedTask] = useState<{ id: string; title: string } | null>(null);
  const [localTags, setLocalTags] = useState<TagOption[]>(
    initialTags.map((t) => ({ id: t.id, name: t.name }))
  );
  const [submitting, setSubmitting] = useState(false);
  const [tagSaving, setTagSaving] = useState(false);
  const [taskSaving, setTaskSaving] = useState(false);
  const [projectSaving, setProjectSaving] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  useEffect(() => {
    if (activeTimer) {
      setSelectedProjectId(activeTimer.projectId ?? "");
      setSelectedTagIds(Array.isArray(activeTimer.tagIds) ? activeTimer.tagIds : []);
      setDescription(activeTimer.description ?? "");
      setSelectedTask(
        activeTimer.notionTaskPageId
          ? {
              id: activeTimer.notionTaskPageId,
              title: activeTimer.notionTaskTitle ?? "Untitled task",
            }
          : null
      );
      return;
    }

    setSelectedProjectId("");
    setSelectedTask(null);
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
        notionTaskPageId: selectedTask?.id ?? null,
        notionTaskTitle: selectedTask?.title ?? null,
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
      await update({
        projectId: selectedProjectId,
        tagIds: nextTagIds,
        notionTaskPageId: selectedTask?.id ?? null,
        notionTaskTitle: selectedTask?.title ?? null,
      });
    } finally {
      setTagSaving(false);
    }
  }

  async function handleProjectChange(nextProjectId: string) {
    setSelectedProjectId(nextProjectId);
    if (!activeTimer) return;

    setProjectSaving(true);
    try {
      await update({
        projectId: nextProjectId,
        tagIds: selectedTagIds,
        description,
        notionTaskPageId: selectedTask?.id ?? null,
        notionTaskTitle: selectedTask?.title ?? null,
      });
    } finally {
      setProjectSaving(false);
    }
  }

  async function handleTaskChange(task: { id: string; title: string } | null) {
    setSelectedTask(task);
    if (!activeTimer) return;

    setTaskSaving(true);
    try {
      await update({
        projectId: selectedProjectId,
        tagIds: selectedTagIds,
        description,
        notionTaskPageId: task?.id ?? null,
        notionTaskTitle: task?.title ?? null,
      });
    } finally {
      setTaskSaving(false);
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
      if (
        activeTimer &&
        (description !== (activeTimer.description ?? "") ||
          (selectedTask?.id ?? null) !== (activeTimer.notionTaskPageId ?? null) ||
          (selectedTask?.title ?? null) !== (activeTimer.notionTaskTitle ?? null))
      ) {
        await handleDescriptionPersist(description, selectedTask);
      }
      await stop(false);
      setDescription("");
      setSelectedProjectId("");
      setSelectedTagIds([]);
      setSelectedTask(null);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDescriptionPersist(
    nextDescription: string,
    nextTask: { id: string; title: string } | null = selectedTask
  ) {
    if (!activeTimer) return;

    setDescriptionSaving(true);
    try {
      await update({
        projectId: selectedProjectId,
        description: nextDescription,
        tagIds: selectedTagIds,
        notionTaskPageId: nextTask?.id ?? null,
        notionTaskTitle: nextTask?.title ?? null,
      });
    } finally {
      setDescriptionSaving(false);
    }
  }

  async function applySuggestion(suggestion: TaskSuggestion) {
    setDescription(suggestion.description);
    setSelectedTask(
      suggestion.notionTaskPageId
        ? {
            id: suggestion.notionTaskPageId,
            title: suggestion.notionTaskTitle ?? "Untitled task",
          }
        : null
    );
    setShowSuggestions(false);

    if (activeTimer) {
      setSelectedTagIds(suggestion.tagIds);
      try {
        await update({
          projectId: activeTimer.projectId,
          description: suggestion.description,
          tagIds: suggestion.tagIds,
          notionTaskPageId: suggestion.notionTaskPageId ?? null,
          notionTaskTitle: suggestion.notionTaskTitle ?? null,
        });
      } catch {
        // ignore suggestion apply failures on running timer
      }
      return;
    }

    setSelectedProjectId(suggestion.projectId);
    setSelectedTagIds(suggestion.tagIds);
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-4 animate-pulse">
        <div className="h-14 bg-[#f5f4ef] rounded-xl" />
        <div className="h-11 bg-[#f5f4ef] rounded-xl" />
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
      <div className="flex flex-col gap-1.5 relative">
        <input
          type="text"
          value={description}
          onChange={(e) => {
            setDescription(e.target.value);
            setShowSuggestions(true);
          }}
          onFocus={() => {
            setShowSuggestions(true);
          }}
          onBlur={() => {
            setTimeout(() => setShowSuggestions(false), 120);
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
        <TaskSuggestions query={description} open={showSuggestions} onPick={applySuggestion} />
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

      <TaskPicker
        value={selectedTask}
        onChange={(task) => void handleTaskChange(task)}
        placeholder="Search Notion tasks…"
        label="Task"
        disabled={submitting || taskSaving}
      />

      {(activeTimer || selectedTask) && (
        <div className="flex items-center justify-between gap-3 -mt-2">
          <p
            className="text-xs text-[#5e605b]"
            style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
          >
            {selectedTask ? `Selected task: ${selectedTask.title}` : "No task selected"}
          </p>
          {taskSaving && (
            <span
              className="text-xs text-[#366769]"
              style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
            >
              Saving task…
            </span>
          )}
        </div>
      )}

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
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <p
                className="text-xs uppercase tracking-wide text-[#5e605b] font-medium"
                style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
              >
                Project for current session
              </p>
              {projectSaving && (
                <span
                  className="text-xs text-[#366769]"
                  style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                >
                  Saving…
                </span>
              )}
            </div>
            <DropdownSelect
              value={selectedProjectId}
              onChange={(value) => void handleProjectChange(value)}
              placeholder="Select project"
              leadingIcon="folder_open"
              leadingIconColor="#366769"
              options={projects.map((p) => ({
                value: p.id,
                label: p.name,
                color: p.color ?? "#366769",
              }))}
              className="min-w-[160px]"
              disabled={submitting || projectSaving}
            />
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
