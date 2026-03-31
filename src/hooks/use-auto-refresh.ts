"use client";

import { useEffect } from "react";

interface UseAutoRefreshOptions {
  enabled?: boolean;
  intervalMs?: number;
}

export function useAutoRefresh(
  refresh: () => Promise<void> | void,
  { enabled = true, intervalMs = 5000 }: UseAutoRefreshOptions = {}
) {
  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const run = async () => {
      if (cancelled) return;
      if (document.visibilityState !== "visible") {
        timeoutId = setTimeout(run, intervalMs);
        return;
      }

      try {
        await refresh();
      } catch {
        // ignore transient refresh errors
      } finally {
        if (!cancelled) {
          timeoutId = setTimeout(run, intervalMs);
        }
      }
    };

    timeoutId = setTimeout(run, intervalMs);

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [enabled, intervalMs, refresh]);
}
