import { auth } from "@/lib/auth";
import { ensureTimerSubscription, timerBroadcaster } from "@/lib/redis";
import { dataBroadcaster, discussionBroadcaster } from "@/lib/realtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  await ensureTimerSubscription();

  const encoder = new TextEncoder();
  let onTimer: ((event: object) => void) | null = null;
  let onData: ((event: object) => void) | null = null;
  let onDiscussion: ((event: object) => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: object) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          // client disconnected
        }
      };

      send({ type: "heartbeat" });

      onTimer = (event: object) => send(event);
      onData = (event: object) => send(event);
      onDiscussion = (event: object) => send(event);

      timerBroadcaster.on("timer", onTimer);
      dataBroadcaster.on("data", onData);
      discussionBroadcaster.on("discussion", onDiscussion);

      heartbeat = setInterval(() => send({ type: "heartbeat" }), 25000);
    },
    cancel() {
      if (onTimer) timerBroadcaster.off("timer", onTimer);
      if (onData) dataBroadcaster.off("data", onData);
      if (onDiscussion) discussionBroadcaster.off("discussion", onDiscussion);
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
