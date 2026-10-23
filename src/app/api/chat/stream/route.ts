import { loadAccess } from "@/lib/auth/session";
import { subscribe } from "@/lib/chat/bus";
import "@/lib/chat/messages"; // registers the loader for messages too big to send inline

/**
 * The chat's live stream (Server-Sent Events): one per open portal tab. New messages, reads and who is online arrive
 * here as `data: {json}` lines. The browser reconnects by itself if it drops.
 */
export async function GET(req: Request) {
  const access = await loadAccess();
  if (!access) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const userId = access.user.id;
  const encoder = new TextEncoder();
  let stop = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          stop();
        }
      };
      const off = subscribe(userId, (evt) => send(`data: ${JSON.stringify(evt)}\n\n`));
      // keeps proxies from closing an idle connection
      const ping = setInterval(() => send(": ping\n\n"), 25_000);
      stop = () => {
        if (closed) return;
        closed = true;
        clearInterval(ping);
        off();
        try {
          controller.close();
        } catch {
          // already closed
        }
      };
      req.signal.addEventListener("abort", stop);
      send("retry: 3000\n\n: open\n\n");
    },
    cancel() {
      stop();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      // no-transform stops `next start` gzipping (and so holding back) the stream
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
