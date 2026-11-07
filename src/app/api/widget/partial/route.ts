import { savePartial } from "@/lib/webchat/chats";
import { visitorPost } from "@/lib/webchat/handler";
import { cleanString, preflight } from "@/lib/webchat/public";

/** The lead form as the visitor fills it in, before Start chat, so sales can still reach someone who leaves halfway. */
export const POST = visitorPost(
  async ({ chat, body }) => {
    // the hidden field people never see; bots fill it in
    if (cleanString(body.website, 200)) return { ok: true };
    await savePartial(chat, {
      name: cleanString(body.name, 120),
      email: cleanString(body.email, 200).toLowerCase(),
      phone: cleanString(body.phone, 40),
      company: cleanString(body.company, 160),
    });
    return { ok: true };
  },
  { max: 60, windowMs: 60_000 },
);

export const OPTIONS = preflight;
