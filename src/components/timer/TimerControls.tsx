"use client";

import { useEffect, useMemo, useState } from "react";
import { useTimer } from "@/hooks/use-timer";
import { Button } from "@/components/ui/Button";
import { DropdownSelect } from "@/components/ui/DropdownSelect";
import { TagMultiSelect, type TagOption } from "@/components/ui/TagMultiSelect";
import { TaskSuggestions, type TaskSuggestion } from "@/components/entries/TaskSuggestions";
import { TaskPicker } from "@/components/entries/TaskPicker";
import { getTimerStopValidation } from "@/lib/timer-rules";
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
  const [actionError, setActionError] = useState<string | null>(null);

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

    setDescription("");
    setSelectedProjectId("");
    setSelectedTagIds([]);
    setSelectedTask(null);
  }, [activeTimer]);

  const selectedProject = projects.find((p) => p.id === selectedProjectId);
  const stopValidation = useMemo(
    () =>
      getTimerStopValidation({
        description,
        notionTaskPageId: selectedTask?.id ?? null,
      }),
    [description, selectedTask]
  );

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
    setSubmitting(true);
    setActionError(null);
    try {
      await start({
        projectId: selectedProjectId || null,
        tagIds: selectedTagIds,
        description,
        notionTaskPageId: selectedTask?.id ?? null,
        notionTaskTitle: selectedTask?.title ?? null,
      });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Failed to start timer.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUpdateTags(nextTagIds: string[]) {
    setSelectedTagIds(nextTagIds);
    if (!activeTimer) return;

    setTagSaving(true);
    setActionError(null);
    try {
      await update({
        projectId: selectedProjectId || null,
        tagIds: nextTagIds,
        description,
        notionTaskPageId: selectedTask?.id ?? null,
        notionTaskTitle: selectedTask?.title ?? null,
      });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Failed to update tags.");
    } finally {
      setTagSaving(false);
    }
  }

  async function handleProjectChange(nextProjectId: string) {
    setSelectedProjectId(nextProjectId);
    if (!activeTimer) return;

    setProjectSaving(true);
    setActionError(null);
    try {
      await update({
        projectId: nextProjectId || null,
        tagIds: selectedTagIds,
        description,
        notionTaskPageId: selectedTask?.id ?? null,
        notionTaskTitle: selectedTask?.title ?? null,
      });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Failed to update project.");
    } finally {
      setProjectSaving(false);
    }
  }

  async function handleTaskChange(task: { id: string; title: string } | null) {
    setSelectedTask(task);
    if (!activeTimer) return;

    setTaskSaving(true);
    setActionError(null);
    try {
      await update({
        projectId: selectedProjectId || null,
        tagIds: selectedTagIds,
        description,
        notionTaskPageId: task?.id ?? null,
        notionTaskTitle: task?.title ?? null,
      });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Failed to update task.");
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

  async function handleDescriptionPersist(
    nextDescription: string,
    nextTask: { id: string; title: string } | null = selectedTask
  ) {
    if (!activeTimer) return;

    setDescriptionSaving(true);
    setActionError(null);
    try {
      await update({
        projectId: selectedProjectId || null,
        description: nextDescription,
        tagIds: selectedTagIds,
        notionTaskPageId: nextTask?.id ?? null,
        notionTaskTitle: nextTask?.title ?? null,
      });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Failed to save timer details.");
    } finally {
      setDescriptionSaving(false);
    }
  }

  async function handleStop() {
    if (!stopValidation.canStop) {
      setActionError(stopValidation.message);
      return;
    }

    setSubmitting(true);
    setActionError(null);
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
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Failed to stop timer.");
    } finally {
      setSubmitting(false);
    }
  }

  async function applySuggestion(suggestion: TaskSuggestion) {
    const nextTask = suggestion.notionTaskPageId
      ? {
          id: suggestion.notionTaskPageId,
          title: suggestion.notionTaskTitle ?? "Untitled task",
        }
      : null;

    setDescription(suggestion.description);
    setSelectedTask(nextTask);
    setSelectedProjectId(suggestion.projectId ?? "");
    setSelectedTagIds(suggestion.tagIds);
    setShowSuggestions(false);
    setActionError(null);

    if (activeTimer) {
      try {
        await update({
          projectId: suggestion.projectId ?? activeTimer.projectId ?? null,
          description: suggestion.description,
          tagIds: suggestion.tagIds,
          notionTaskPageId: suggestion.notionTaskPageId ?? null,
          notionTaskTitle: suggestion.notionTaskTitle ?? null,
        });
      } catch {
        // keep local suggestion state even if persistence fails
      }
      return;
    }

    try {
      await start({
        projectId: suggestion.projectId ?? null,
        tagIds: suggestion.tagIds,
        description: suggestion.description,
        notionTaskPageId: suggestion.notionTaskPageId ?? null,
        notionTaskTitle: suggestion.notionTaskTitle ?? null,
      });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Failed to start timer from suggestion.");
    }
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

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5 relative">
        <input
          type="text"
          value={description}
          onChange={(e) => {
            setDescription(e.target.value);
            setShowSuggestions(true);
            setActionError(null);
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
            if (!activeTimer && e.key === "Enter") void handleStart();
            if (activeTimer && e.key === "Enter") {
              e.currentTarget.blur();
            }
          }}
          placeholder="What are you working on?"
          className="w-full bg-transparent text-2xl italic text-[#31332f] placeholder:text-[#b2b2ad] outline-none py-2 border-b-2 border-[#efeee9] focus:border-[#366769] transition-colors"
          style={{ fontFamily: "var(--font-newsreader, 'Newsreader'), serif" }}
        />
        <TaskSuggestions query={description} open={showSuggestions} onPick={applySuggestion} />
        {activeTimer && !stopValidation.canStop && (
          <p
            className="text-xs text-[#a73b21]"
            style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
          >
            {stopValidation.message}
          </p>
        )}
        {activeTimer && descriptionSaving && (
          <p
            className="text-xs text-[#366769]"
            style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
          >
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
            placeholder="Select project (optional)"
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
              placeholder="Select project (optional)"
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

      {activeTimer && !stopValidation.canStop && (
        <div className="md:hidden rounded-xl border border-[#f4d5cc] bg-[#fff7f6] px-4 py-3 text-sm text-[#791903]">
          <div className="flex items-start gap-2">
            <span className="material-symbols-outlined shrink-0" style={{ fontSize: "18px" }}>
              info
            </span>
            <p style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}>
              You can&apos;t stop this timer yet. {stopValidation.message}
            </p>
          </div>
        </div>
      )}

      {actionError && (
        <p
          className="text-sm text-[#a73b21]"
          style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
        >
          {actionError}
        </p>
      )}

      <div className="flex items-center gap-3 pt-2">
        {!activeTimer ? (
          <Button variant="primary" size="lg" onClick={handleStart} loading={submitting}>
            <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>
              play_arrow
            </span>
            Start Session
          </Button>
        ) : (
          <Button
            variant={stopValidation.canStop ? "primary" : "secondary"}
            size="lg"
            onClick={handleStop}
            loading={submitting}
            disabled={!stopValidation.canStop || descriptionSaving || taskSaving}
          >
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
