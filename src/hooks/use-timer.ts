"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { ActiveTimer } from "@/types";

export function useTimer() {
  const [activeTimer, setActiveTimer] = useState<ActiveTimer | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [loading, setLoading] = useState(true);

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

  const stopTicking = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setElapsed(0);
  }, []);

  // Load initial timer state
  useEffect(() => {
    fetch("/api/timer/active")
      .then((r) => r.json())
      .then(({ timer }: { timer: ActiveTimer | null }) => {
        if (timer) {
          setActiveTimer(timer);
          startTicking(timer.startedAt);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [startTicking]);

  const start = useCallback(
    async (payload: { projectId: string; tagId?: string | null; description: string }) => {
      const res = await fetch("/api/timer/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const { timer } = await res.json();
      setActiveTimer(timer);
      startTicking(timer.startedAt);
      return timer as ActiveTimer;
    },
    [startTicking]
  );

  const stop = useCallback(
    async (discard = false) => {
      await fetch("/api/timer/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ discard }),
      });
      setActiveTimer(null);
      stopTicking();
    },
    [stopTicking]
  );

  // Sync from SSE events
  const syncFromSSE = useCallback(
    (event: { type: string; userId?: string; data: ActiveTimer | null }) => {
      if (event.type === "timer:start" && event.data) {
        setActiveTimer(event.data);
        startTicking(event.data.startedAt);
      } else if (event.type === "timer:stop") {
        setActiveTimer(null);
        stopTicking();
      }
    },
    [startTicking, stopTicking]
  );

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return { activeTimer, elapsed, loading, start, stop, syncFromSSE };
}
