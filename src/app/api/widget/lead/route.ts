import { saveLead, visitorState } from "@/lib/webchat/chats";
import { visitorPost } from "@/lib/webchat/handler";
import { cleanString, preflight } from "@/lib/webchat/public";
import { MAX_WEB_BODY } from "@/lib/webchat/types";

/** The lead form: name, email, phone, company and the first question. Needed before the visitor can chat. */
export const POST = visitorPost(
  async ({ chat, body }) => {
    // a hidden field people never see; bots fill it in
    if (cleanString(body.website, 200)) return { ok: true };
    const lead = {
      name: cleanString(body.name, 120),
      email: cleanString(body.email, 200).toLowerCase(),
      phone: cleanString(body.phone, 40),
      company: cleanString(body.company, 160),
      message: cleanString(body.message, MAX_WEB_BODY),
    };
    if (lead.name.length < 2) throw new Error("Please enter your name.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(lead.email)) throw new Error("Please enter a valid email address.");
    if (lead.phone && !/^[+\d][\d\s()-]{5,}$/.test(lead.phone)) throw new Error("Please enter a valid phone number.");
    await saveLead(chat, lead);
    return { state: await visitorState({ ...chat, leadAt: new Date() }) };
  },
  { max: 10, windowMs: 60 * 60_000 },
);

export const OPTIONS = preflight;
