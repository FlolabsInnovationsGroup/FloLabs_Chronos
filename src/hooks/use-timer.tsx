"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSSE } from "@/hooks/use-sse";
import type { ActiveTimer, SSEEvent } from "@/types";

interface TimerContextValue {
  activeTimer: ActiveTimer | null;
  elapsed: number;
  loading: boolean;
  start: (payload: { projectId: string; tagIds?: string[]; description: string; notionTaskPageId?: string | null; notionTaskTitle?: string | null }) => Promise<ActiveTimer>;
  update: (payload: { projectId?: string; tagIds?: string[]; description?: string; notionTaskPageId?: string | null; notionTaskTitle?: string | null }) => Promise<ActiveTimer>;
  stop: (discard?: boolean) => Promise<void>;
}

const TimerContext = createContext<TimerContextValue | null>(null);

interface TimerProviderProps {
  children: React.ReactNode;
  userId: string;
}

export function TimerProvider({ children, userId }: TimerProviderProps) {
  const [activeTimer, setActiveTimer] = useState<ActiveTimer | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const tick = useCallback((startedAt: number) => {
    setElapsed(Date.now() - startedAt);
  }, []);

  const startTicking = useCallback(
    (startedAt: number) => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      tick(startedAt);
      intervalRef.current = setInterval(() => tick(startedAt), 1000);
    },
    [tick]
  );

  const clearTimerState = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setActiveTimer(null);
    setElapsed(0);
  }, []);

  const applyTimerState = useCallback(
    (timer: ActiveTimer | null) => {
      if (!timer) {
        clearTimerState();
        return;
      }

      setActiveTimer(timer);
      startTicking(timer.startedAt);
    },
    [clearTimerState, startTicking]
  );

  useEffect(() => {
    let cancelled = false;

    async function loadInitialTimer() {
      try {
        const res = await fetch("/api/timer/active");
        if (!res.ok) return;

        const { timer }: { timer: ActiveTimer | null } = await res.json();
        if (!cancelled) applyTimerState(timer);
      } catch {
        // Keep the UI usable even if the initial timer fetch fails.
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadInitialTimer();

    return () => {
      cancelled = true;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [applyTimerState]);

  useSSE(
    useCallback(
      (event: SSEEvent) => {
        if (event.type === "heartbeat" || event.userId !== userId) return;
        applyTimerState(event.data ?? null);
      },
      [applyTimerState, userId]
    )
  );

  const start = useCallback(
    async (payload: { projectId: string; tagIds?: string[]; description: string; notionTaskPageId?: string | null; notionTaskTitle?: string | null }) => {
      const res = await fetch("/api/timer/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = (await res.json()) as { error?: string; timer?: ActiveTimer };
      if (!res.ok || !data.timer) {
        throw new Error(data.error ?? "Failed to start timer");
      }

      applyTimerState(data.timer);
      return data.timer;
    },
    [applyTimerState]
  );

  const update = useCallback(
    async (payload: { projectId?: string; tagIds?: string[]; description?: string; notionTaskPageId?: string | null; notionTaskTitle?: string | null }) => {
      const res = await fetch("/api/timer", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = (await res.json().catch(() => ({ error: "Failed to update timer" }))) as {
        error?: string;
        timer?: ActiveTimer;
      };

      if (!res.ok || !data.timer) {
        throw new Error(data.error ?? "Failed to update timer");
      }

      applyTimerState(data.timer);
      return data.timer;
    },
    [applyTimerState]
  );

  const stop = useCallback(
    async (discard = false) => {
      const res = await fetch("/api/timer/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ discard }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({ error: "Failed to stop timer" }))) as {
          error?: string;
        };
        throw new Error(data.error ?? "Failed to stop timer");
      }

      clearTimerState();
    },
    [clearTimerState]
  );

  const value = useMemo(
    () => ({ activeTimer, elapsed, loading, start, update, stop }),
    [activeTimer, elapsed, loading, start, update, stop]
  );

  return <TimerContext.Provider value={value}>{children}</TimerContext.Provider>;
}

export function useTimer() {
  const context = useContext(TimerContext);

  if (!context) {
    throw new Error("useTimer must be used within a TimerProvider");
  }

  return context;
}
