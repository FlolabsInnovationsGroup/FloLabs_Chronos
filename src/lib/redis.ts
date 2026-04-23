import { kv } from "@vercel/kv";
import { createClient } from "redis";
import type { ActiveTimer } from "@/types";

// Fallback in-memory store for local dev without Vercel KV
const memStore = new Map<string, string>();
const TIMER_CHANNEL = "timers:updates";
const redisUrl = process.env.FL_KV_REDIS_URL ?? process.env.KV_URL;

const isKvAvailable = Boolean(
  process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN
);

type CommandClient = ReturnType<typeof createClient>;

let commandClientPromise: Promise<CommandClient> | null = null;
let subscriptionPromise: Promise<void> | null = null;
let redisDisabled = false;

function getRedisClient() {
  if (!redisUrl || redisDisabled) return null;
  if (!commandClientPromise) {
    const client = createClient({ url: redisUrl });
    client.on("error", () => {});
    commandClientPromise = client.connect().then(() => client).catch((error) => {
      redisDisabled = true;
      commandClientPromise = null;
      console.error('[redis] command client connect failed, falling back', error);
      return Promise.reject(error);
    });
  }
  return commandClientPromise;
}

async function kvGet(key: string): Promise<string | null> {
  try {
    const client = getRedisClient();
    if (client) return (await client).get(key);
  } catch {}
  if (isKvAvailable) {
    try {
      return await kv.get<string>(key);
    } catch (error) {
      console.error('[redis] kv get failed', error);
    }
  }
  return memStore.get(key) ?? null;
}

async function kvSet(key: string, value: string): Promise<void> {
  try {
    const client = getRedisClient();
    if (client) {
      await (await client).set(key, value);
      return;
    }
  } catch {}
  if (isKvAvailable) {
    try {
      await kv.set(key, value);
      return;
    } catch (error) {
      console.error('[redis] kv set failed', error);
    }
  }
  memStore.set(key, value);
}

async function kvDel(key: string): Promise<void> {
  try {
    const client = getRedisClient();
    if (client) {
      await (await client).del(key);
      return;
    }
  } catch {}
  if (isKvAvailable) {
    try {
      await kv.del(key);
      return;
    } catch (error) {
      console.error('[redis] kv del failed', error);
    }
  }
  memStore.delete(key);
}

async function kvKeys(pattern: string): Promise<string[]> {
  try {
    const client = getRedisClient();
    if (client) return (await client).keys(pattern);
  } catch {}
  if (isKvAvailable) {
    try {
      return await kv.keys(pattern);
    } catch (error) {
      console.error('[redis] kv keys failed', error);
    }
  }
  const prefix = pattern.replace("*", "");
  return [...memStore.keys()].filter((k) => k.startsWith(prefix));
}

async function kvMGet(keys: string[]): Promise<Array<string | null>> {
  if (!keys.length) return [];
  try {
    const client = getRedisClient();
    if (client) return (await client).mGet(keys);
  } catch {}
  if (isKvAvailable) {
    try {
      return await kv.mget<string[]>(...keys);
    } catch (error) {
      console.error('[redis] kv mget failed', error);
    }
  }
  return keys.map((key) => memStore.get(key) ?? null);
}

function parseActiveTimer(raw: string | null): ActiveTimer | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ActiveTimer;
  } catch {
    return null;
  }
}

export async function setActiveTimer(userId: string, timer: ActiveTimer) {
  await kvSet(`timer:${userId}`, JSON.stringify(timer));
}

export async function getActiveTimer(userId: string): Promise<ActiveTimer | null> {
  return parseActiveTimer(await kvGet(`timer:${userId}`));
}

export async function deleteActiveTimer(userId: string) {
  await kvDel(`timer:${userId}`);
}

export async function getAllActiveTimers(): Promise<Record<string, ActiveTimer>> {
  const keys = await kvKeys("timer:*");
  if (!keys.length) return {};

  const rawTimers = await kvMGet(keys);
  const result: Record<string, ActiveTimer> = {};

  for (let i = 0; i < keys.length; i += 1) {
    const timer = parseActiveTimer(rawTimers[i] ?? null);
    if (!timer) continue;
    const userId = keys[i]?.replace("timer:", "");
    if (!userId) continue;
    result[userId] = timer;
  }

  return result;
}

// Simple SSE broadcast via a shared in-process EventEmitter (works on single instance)
// For multi-instance Vercel, replace with Redis pub/sub
import { EventEmitter } from "events";

class TimerBroadcaster extends EventEmitter {}
export const timerBroadcaster = new TimerBroadcaster();
timerBroadcaster.setMaxListeners(1000);

export async function ensureTimerSubscription() {
  if (!redisUrl || redisDisabled) return;
  if (!subscriptionPromise) {
    subscriptionPromise = (async () => {
      const subscriber = createClient({ url: redisUrl });
      subscriber.on("error", () => {});
      await subscriber.connect();
      await subscriber.subscribe(TIMER_CHANNEL, (message) => {
        try {
          timerBroadcaster.emit("timer", JSON.parse(message));
        } catch {
          // ignore malformed payloads
        }
      });
    })().catch((error) => {
      subscriptionPromise = null;
      throw error;
    });
  }

  await subscriptionPromise;
}

export async function broadcastTimerEvent(event: object) {
  timerBroadcaster.emit("timer", event);
  try {
    const client = getRedisClient();
    if (client) {
      await (await client).publish(TIMER_CHANNEL, JSON.stringify(event));
    }
  } catch (error) {
    console.error('[redis] publish failed', error);
  }
}
