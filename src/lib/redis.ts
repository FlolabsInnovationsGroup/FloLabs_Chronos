import { kv } from "@vercel/kv";
import type { ActiveTimer } from "@/types";

// Fallback in-memory store for local dev without Vercel KV
const memStore = new Map<string, string>();

const isKvAvailable = Boolean(
  process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN
);

async function kvGet(key: string): Promise<string | null> {
  if (isKvAvailable) return kv.get<string>(key);
  return memStore.get(key) ?? null;
}

async function kvSet(key: string, value: string): Promise<void> {
  if (isKvAvailable) {
    await kv.set(key, value);
  } else {
    memStore.set(key, value);
  }
}

async function kvDel(key: string): Promise<void> {
  if (isKvAvailable) {
    await kv.del(key);
  } else {
    memStore.delete(key);
  }
}

async function kvKeys(pattern: string): Promise<string[]> {
  if (isKvAvailable) return kv.keys(pattern);
  const prefix = pattern.replace("*", "");
  return [...memStore.keys()].filter((k) => k.startsWith(prefix));
}

export async function setActiveTimer(userId: string, timer: ActiveTimer) {
  await kvSet(`timer:${userId}`, JSON.stringify(timer));
}

export async function getActiveTimer(userId: string): Promise<ActiveTimer | null> {
  const raw = await kvGet(`timer:${userId}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ActiveTimer;
  } catch {
    return null;
  }
}

export async function deleteActiveTimer(userId: string) {
  await kvDel(`timer:${userId}`);
}

export async function getAllActiveTimers(): Promise<Record<string, ActiveTimer>> {
  const keys = await kvKeys("timer:*");
  if (!keys.length) return {};
  const result: Record<string, ActiveTimer> = {};
  for (const key of keys) {
    const raw = await kvGet(key);
    if (raw) {
      try {
        const userId = key.replace("timer:", "");
        result[userId] = JSON.parse(raw) as ActiveTimer;
      } catch {
        // skip
      }
    }
  }
  return result;
}

// Simple SSE broadcast via a shared in-process EventEmitter (works on single instance)
// For multi-instance Vercel, replace with Redis pub/sub
import { EventEmitter } from "events";

class TimerBroadcaster extends EventEmitter {}
export const timerBroadcaster = new TimerBroadcaster();
timerBroadcaster.setMaxListeners(1000);

export function broadcastTimerEvent(event: object) {
  timerBroadcaster.emit("timer", event);
}
