import { createClient } from "redis";

const memStore = new Map<string, { value: string; expiresAt: number }>();
const redisUrl = process.env.FL_KV_REDIS_URL ?? process.env.KV_URL;

type CommandClient = ReturnType<typeof createClient>;
let clientPromise: Promise<CommandClient> | null = null;

function getClient(): Promise<CommandClient> | null {
  if (!redisUrl) return null;
  if (!clientPromise) {
    const c = createClient({ url: redisUrl });
    c.on("error", () => {});
    clientPromise = c.connect().then(() => c);
  }
  return clientPromise;
}

export async function kvGet(key: string): Promise<string | null> {
  const client = getClient();
  if (client) {
    return (await client).get(key);
  }
  const entry = memStore.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) { memStore.delete(key); return null; }
  return entry.value;
}

export async function kvSet(key: string, value: string, ttlSeconds: number): Promise<void> {
  const client = getClient();
  if (client) {
    await (await client).set(key, value, { EX: ttlSeconds });
    return;
  }
  memStore.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
}
