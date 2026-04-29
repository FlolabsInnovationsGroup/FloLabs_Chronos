"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useSSE } from "@/hooks/use-sse";
import { useTimer } from "@/hooks/use-timer";
import { getCalendarWeekRangeLocal } from "@/lib/utils";
import { TimerDisplay } from "@/components/timer/TimerDisplay";
import { TimerControls } from "@/components/timer/TimerControls";
import { ActiveTimerCard } from "@/components/timer/ActiveTimerCard";
import { EntryList } from "@/components/entries/EntryList";
import { DiscussionCard } from "@/components/discussions/DiscussionCard";
import type { Project, Tag, TimeEntry, SSEEvent, EntryDiscussion } from "@/types";

interface TimerDashboardClientProps {
  projects: Project[];
  tags: Tag[];
  initialWeekEntries: TimeEntry[];
  initialRecentEntries: TimeEntry[];
  weeklyTargetHours: number;
  initialDiscussions: EntryDiscussion[];
}

export function TimerDashboardClient({
  projects,
  tags,
  initialWeekEntries,
  initialRecentEntries,
  weeklyTargetHours,
  initialDiscussions,
}: TimerDashboardClientProps) {
  const { data: session } = useSession();
  const { activeTimer, start, stop } = useTimer();
  const userId = session?.user.chronosUserId ?? session?.user.id;

  const [weekEntries, setWeekEntries] = useState<TimeEntry[]>(initialWeekEntries);
  const [recentEntries, setRecentEntries] = useState<TimeEntry[]>(initialRecentEntries);
  const [discussions, setDiscussions] = useState<EntryDiscussion[]>(initialDiscussions);

  const refreshEntries = useCallback(async () => {
    if (!userId) return;

    const { start: weekStart, end: weekEnd } = getCalendarWeekRangeLocal(new Date());
    const weekFrom = weekStart.toISOString();
    const weekTo = weekEnd.toISOString();
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const [weekRes, recentRes] = await Promise.all([
      fetch(
        `/api/entries?userId=${userId}&from=${encodeURIComponent(weekFrom)}&to=${encodeURIComponent(weekTo)}&limit=200`,
        { cache: "no-store" }
      ),
      fetch(`/api/entries?userId=${userId}&from=${encodeURIComponent(sevenDaysAgo)}&limit=50`, { cache: "no-store" }),
    ]);

    const weekData = await weekRes.json();
    const recentData = await recentRes.json();

    setWeekEntries(weekData.entries ?? []);
    setRecentEntries(recentData.entries ?? []);
  }, [userId]);

  const refreshDiscussions = useCallback(async () => {
    try {
      const res = await fetch("/api/discussions", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json() as { discussions?: EntryDiscussion[] };
        setDiscussions(data.discussions ?? []);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    setWeekEntries(initialWeekEntries);
    setRecentEntries(initialRecentEntries);
  }, [initialRecentEntries, initialWeekEntries]);

  useEffect(() => {
    setDiscussions(initialDiscussions);
  }, [initialDiscussions]);

  useSSE(
    useCallback(
      (event: SSEEvent) => {
        if (!userId) return;
        if ((event.type === "timer:start" || event.type === "timer:stop") && event.userId === userId) {
          void refreshEntries();
        }
        if (event.type === "discussion:new" || event.type === "discussion:resolved") {
          void refreshDiscussions();
        }
      },
      [refreshEntries, refreshDiscussions, userId]
    )
  );

  async function handleReplay(entry: TimeEntry) {
    if (activeTimer) {
      await stop(false);
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
      <div className="grid grid-cols-12 gap-5 md:gap-8 min-w-0">
        <div className="col-span-12 md:col-span-7 flex min-w-0 flex-col gap-6 md:gap-8">
          <TimerDisplay />
          <TimerControls projects={projects} tags={tags} onSessionStopped={refreshEntries} />
        </div>

        <div className="col-span-12 md:col-span-5 min-w-0 flex flex-col gap-5">
          <DiscussionCard
            initialDiscussions={discussions}
            viewerRole={session?.user.role ?? "member"}
            viewerChronosUserId={session?.user.chronosUserId ?? null}
            viewerApplicantId={session?.user.id ?? null}
          />
          <ActiveTimerCard weekEntries={weekEntries} weeklyTargetHours={weeklyTargetHours} />
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium text-on-background" style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}>
            Last 7 Days
          </h2>
          <span className="text-sm text-outline-variant" style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}>
            {recentEntries.length} entries
          </span>
        </div>
        <EntryList
          entries={recentEntries}
          onResume={handleReplay}
          viewerRole={session?.user.role ?? "member"}
          viewerId={session?.user.id ?? ""}
          emptyMessage="No sessions yet. Start your first one above."
        />
      </div>
    </>
  );
}
