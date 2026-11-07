import { publish } from "@/lib/chat/bus";
import { saveDraft } from "@/lib/webchat/chats";
import { visitorPost } from "@/lib/webchat/handler";
import { preflight } from "@/lib/webchat/public";
import { MAX_WEB_BODY } from "@/lib/webchat/types";

/**
 * The visitor's message box as they type (sent about twice a second): every agent sees the text live, before Enter.
 * Widgets from before the live preview send no text: those only say "Visitor is typing…" to the agent on the chat.
 */
export const POST = visitorPost(
  async ({ chat, body }) => {
    if (typeof body.text === "string") await saveDraft(chat, body.text.slice(0, MAX_WEB_BODY));
    else if (chat.agentId && chat.status === "active") await publish([chat.agentId], { t: "web.typing", chatId: chat.id });
    return { ok: true };
  },
  { max: 180, windowMs: 60_000 },
);

export const OPTIONS = preflight;
