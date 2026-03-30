"use client";

import { useState } from "react";
import { useTimer } from "@/hooks/use-timer";
import { Button } from "@/components/ui/Button";
import { DropdownSelect } from "@/components/ui/DropdownSelect";
import type { Project, Tag } from "@/types";

interface TimerControlsProps {
  projects: Project[];
  tags: Tag[];
}

export function TimerControls({ projects, tags }: TimerControlsProps) {
  const { activeTimer, start, stop, loading } = useTimer();

  const [description, setDescription] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [selectedTagId, setSelectedTagId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  async function handleStart() {
    if (!selectedProjectId) return;
    setSubmitting(true);
    try {
      await start({
        projectId: selectedProjectId,
        tagId: selectedTagId || null,
        description,
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStop() {
    setSubmitting(true);
    try {
      await stop(false);
      setDescription("");
      setSelectedProjectId("");
      setSelectedTagId("");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDiscard() {
    setSubmitting(true);
    try {
      await stop(true);
      setDescription("");
      setSelectedProjectId("");
      setSelectedTagId("");
    } finally {
      setSubmitting(false);
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
      {/* Description input */}
      {!activeTimer ? (
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && selectedProjectId) handleStart();
          }}
          placeholder="What are you working on?"
          className="w-full bg-transparent text-2xl italic text-[#31332f] placeholder:text-[#b2b2ad] outline-none py-2 border-b-2 border-[#efeee9] focus:border-[#366769] transition-colors"
          style={{ fontFamily: "var(--font-newsreader, 'Newsreader'), serif" }}
          disabled={!!activeTimer}
        />
      ) : (
        <p
          className="text-2xl italic text-[#5e605b] py-2 border-b-2 border-[#efeee9] truncate"
          style={{ fontFamily: "var(--font-newsreader, 'Newsreader'), serif" }}
        >
          {activeTimer.description || "No description"}
        </p>
      )}

      {/* Pill selectors row */}
      {!activeTimer && (
        <div className="flex flex-wrap gap-2">
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
          />

          <DropdownSelect
            value={selectedTagId}
            onChange={setSelectedTagId}
            placeholder="Add tag"
            leadingIcon="label"
            leadingIconColor="#755a40"
            options={tags.map((t) => ({
              value: t.id,
              label: t.name,
              color: t.color ?? "#755a40",
            }))}
          />
        </div>
      )}

      {/* Active timer project/tag display */}
      {activeTimer && (
        <div className="flex flex-wrap gap-2">
          {(() => {
            const proj = projects.find((p) => p.id === activeTimer.projectId);
            const tag = activeTimer.tagId ? tags.find((t) => t.id === activeTimer.tagId) : null;
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
                {tag && (
                  <span
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm bg-[#fed9b8] text-[#503921]"
                    style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: tag.color ?? "#755a40" }}
                    />
                    {tag.name}
                  </span>
                )}
              </>
            );
          })()}
        </div>
      )}

      {/* Action buttons */}
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
          <>
            <Button variant="primary" size="lg" onClick={handleStop} loading={submitting}>
              <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>
                stop
              </span>
              Stop Session
            </Button>
            <Button variant="danger" size="md" onClick={handleDiscard} disabled={submitting}>
              <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>
                delete
              </span>
              Discard
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
