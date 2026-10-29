import { publish } from "@/lib/chat/bus";
import { visitorPost } from "@/lib/webchat/handler";
import { preflight } from "@/lib/webchat/public";

/** "Visitor is typing…" for the agent on the chat. */
export const POST = visitorPost(
  async ({ chat }) => {
    if (chat.agentId && chat.status === "active") await publish([chat.agentId], { t: "web.typing", chatId: chat.id });
    return { ok: true };
  },
  { max: 40, windowMs: 60_000 },
);

export const OPTIONS = preflight;
