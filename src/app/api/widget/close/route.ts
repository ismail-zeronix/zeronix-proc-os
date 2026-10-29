import { closeChat } from "@/lib/webchat/chats";
import { visitorPost } from "@/lib/webchat/handler";
import { preflight } from "@/lib/webchat/public";

/** The visitor pressed "End chat". */
export const POST = visitorPost(
  async ({ chat }) => {
    await closeChat(chat.id, "visitor");
    return { ok: true };
  },
  { max: 10, windowMs: 60_000 },
);

export const OPTIONS = preflight;
