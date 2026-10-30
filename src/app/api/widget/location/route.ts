import { savePreciseLocation } from "@/lib/webchat/chats";
import { visitorPost } from "@/lib/webchat/handler";
import { preflight } from "@/lib/webchat/public";

/** The visitor allowed their browser to share where they are (asked once, after they start the chat). */
export const POST = visitorPost(
  async ({ chat, body }) => {
    const lat = Number(body.lat);
    const lon = Number(body.lon);
    const accuracy = Number(body.accuracy) || 0;
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) throw new Error("Bad location");
    await savePreciseLocation(chat, lat, lon, Math.min(Math.max(accuracy, 0), 100_000));
    return { ok: true };
  },
  { max: 5, windowMs: 60 * 60_000 },
);

export const OPTIONS = preflight;
