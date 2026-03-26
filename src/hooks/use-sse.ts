"use client";

import { useEffect, useRef } from "react";
import type { SSEEvent } from "@/types";

export function useSSE(onEvent: (event: SSEEvent) => void) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    let es: EventSource | null = null;
    let retryTimeout: ReturnType<typeof setTimeout>;
    let retries = 0;

    function connect() {
      es = new EventSource("/api/sse");

      es.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data) as SSEEvent;
          onEventRef.current(data);
        } catch {
          // ignore
        }
      };

      es.onerror = () => {
        es?.close();
        // Exponential backoff: 1s, 2s, 4s, 8s, max 30s
        const delay = Math.min(1000 * Math.pow(2, retries), 30000);
        retries++;
        retryTimeout = setTimeout(connect, delay);
      };

      es.onopen = () => {
        retries = 0;
      };
    }

    connect();

    return () => {
      clearTimeout(retryTimeout);
      es?.close();
    };
  }, []);
}
