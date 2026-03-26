"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { formatDuration, formatTime } from "@/lib/utils";
import type { TimeEntry } from "@/types";

interface EntryCardProps {
  entry: TimeEntry;
  onResume?: (entry: TimeEntry) => void;
}

export function EntryCard({ entry, onResume }: EntryCardProps) {
  const [hovered, setHovered] = useState(false);

  const duration = entry.durationMs ? formatDuration(entry.durationMs) : "--:--:--";
  const startTime = formatTime(entry.startedAt);
  const endTime = entry.stoppedAt ? formatTime(entry.stoppedAt) : "running";

  const projectColor = entry.project?.color ?? "#366769";
  const projectName = entry.project?.name ?? "Unknown";
  const tagName = entry.tag?.name;
  const tagColor = entry.tag?.color ?? "#755a40";

  return (
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
      <div className="flex items-center gap-3 shrink-0">
        {/* Resume button — shown on hover */}
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

        {/* Duration */}
        <span
          className="text-xl font-light italic text-[#31332f] tabular-nums min-w-[5.5rem] text-right"
          style={{ fontFamily: "var(--font-newsreader, 'Newsreader'), serif" }}
        >
          {duration}
        </span>
      </div>
    </div>
  );
}
