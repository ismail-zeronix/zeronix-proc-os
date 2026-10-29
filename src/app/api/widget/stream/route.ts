import { subscribeVisitor, visitorConnected } from "@/lib/chat/bus";
import "@/lib/chat/presence"; // the team's status (online / do not disturb) for "who is online"
import { chatByToken, onlineTeam, touch, visitorLeft } from "@/lib/webchat/chats";
import { corsHeaders, originOf } from "@/lib/webchat/public";

/**
 * The visitor's live stream (Server-Sent Events): the agent's lines, "typing", the chat being accepted or ended, and
 * who in sales is online. While it is open the visitor counts as on the site; when it closes and does not come back
 * (moving to another page reopens it within a few seconds), the portals stop ringing for them.
 */
export async function GET(req: Request) {
  const origin = originOf(req);
  if (origin === null) return new Response(null, { status: 403 });
  const chat = await chatByToken(new URL(req.url).searchParams.get("token") ?? "");
  if (!chat) return new Response(null, { status: 404, headers: corsHeaders(origin) });
  const chatId = chat.id;
  await touch(chatId);
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
      const off = subscribeVisitor(chatId, (evt) => send(`data: ${JSON.stringify(evt)}\n\n`));
      let lastTeam = "";
      // keeps the visitor "on the site", keeps proxies from closing the idle connection, and refreshes who is online
      const ping = setInterval(() => {
        send(": ping\n\n");
        void touch(chatId).catch(() => {});
        void onlineTeam()
          .then((team) => {
            const key = JSON.stringify(team);
            if (key !== lastTeam) send(`data: ${JSON.stringify({ t: "team", team })}\n\n`);
            lastTeam = key;
          })
          .catch(() => {});
      }, 20_000);
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
        setTimeout(() => {
          if (!visitorConnected(chatId)) void visitorLeft(chatId).catch(() => {});
        }, 15_000);
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
      ...corsHeaders(origin),
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
