import { auth } from "@/lib/auth";
import { timerBroadcaster } from "@/lib/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      const send = (data: object) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          // client disconnected
        }
      };

      // Send initial heartbeat
      send({ type: "heartbeat" });

      const onTimer = (event: object) => send(event);
      timerBroadcaster.on("timer", onTimer);

      // Heartbeat every 25s to keep connection alive
      const heartbeat = setInterval(() => send({ type: "heartbeat" }), 25000);

      return () => {
        timerBroadcaster.off("timer", onTimer);
        clearInterval(heartbeat);
      };
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
