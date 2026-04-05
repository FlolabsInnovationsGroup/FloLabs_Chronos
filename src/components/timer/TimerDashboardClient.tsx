"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useSSE } from "@/hooks/use-sse";
import { useTimer } from "@/hooks/use-timer";
import { TimerDisplay } from "@/components/timer/TimerDisplay";
import { TimerControls } from "@/components/timer/TimerControls";
import { ActiveTimerCard } from "@/components/timer/ActiveTimerCard";
import { EntryList } from "@/components/entries/EntryList";
import type { Project, Tag, TimeEntry, SSEEvent } from "@/types";

interface TimerDashboardClientProps {
  projects: Project[];
  tags: Tag[];
  initialTodayEntries: TimeEntry[];
  initialRecentEntries: TimeEntry[];
  targetHours: number;
}

export function TimerDashboardClient({
  projects,
  tags,
  initialTodayEntries,
  initialRecentEntries,
  targetHours,
}: TimerDashboardClientProps) {
  const { data: session } = useSession();
  const { activeTimer, start } = useTimer();
  const userId = session?.user.id;

  const [todayEntries, setTodayEntries] = useState<TimeEntry[]>(initialTodayEntries);
  const [recentEntries, setRecentEntries] = useState<TimeEntry[]>(initialRecentEntries);

  const refreshEntries = useCallback(async () => {
    if (!userId) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const from = today.toISOString();

    const [todayRes, recentRes] = await Promise.all([
      fetch(`/api/entries?userId=${userId}&from=${encodeURIComponent(from)}&limit=50`, { cache: "no-store" }),
      fetch(`/api/entries?userId=${userId}&limit=50`, { cache: "no-store" }),
    ]);

    const todayData = await todayRes.json();
    const recentData = await recentRes.json();

    setTodayEntries(todayData.entries ?? []);
    setRecentEntries(recentData.entries ?? []);
  }, [userId]);

  useEffect(() => {
    setTodayEntries(initialTodayEntries);
    setRecentEntries(initialRecentEntries);
  }, [initialRecentEntries, initialTodayEntries]);

  useSSE(
    useCallback(
      (event: SSEEvent) => {
        if (!userId) return;
        if ((event.type === "timer:start" || event.type === "timer:stop") && event.userId === userId) {
          void refreshEntries();
        }
      },
      [refreshEntries, userId]
    )
  );

  async function handleReplay(entry: TimeEntry) {
    if (activeTimer) {
      throw new Error("Stop the current timer before starting a new one from a past entry.");
    }

    await start({
      projectId: entry.projectId ?? null,
      tagIds: (entry.tags ?? []).map((tag) => tag.id),
      description: entry.description,
      notionTaskPageId: entry.notionTaskPageId ?? null,
      notionTaskTitle: entry.notionTaskTitle ?? null,
    });
  }

  return (
    <>
      <div className="grid grid-cols-12 gap-8">
        <div className="col-span-12 md:col-span-7 flex flex-col gap-8">
          <TimerDisplay />
          <TimerControls projects={projects} tags={tags} />
        </div>

        <div className="col-span-12 md:col-span-5">
          <ActiveTimerCard todayEntries={todayEntries} targetHours={targetHours} />
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium text-[#31332f]" style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}>
            Recent Sessions
          </h2>
          <span className="text-sm text-[#b2b2ad]" style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}>
            {recentEntries.length} entries
          </span>
        </div>
        <EntryList entries={recentEntries} onResume={handleReplay} emptyMessage="No sessions yet. Start your first one above." />
      </div>
    </>
  );
}
