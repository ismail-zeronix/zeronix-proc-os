import { arrive, visitorState } from "@/lib/webchat/chats";
import { allow, cleanString, clientIp, originOf, preflight, readJson, reply } from "@/lib/webchat/public";

/**
 * The widget loaded on a page of the website: picks up the visitor's chat (from the token their browser kept) or starts
 * a new one, which makes the sales team's portals ring. Returns the token and everything the widget shows.
 */
export async function POST(req: Request) {
  const origin = originOf(req);
  if (origin === null) return new Response(null, { status: 403 });
  const body = await readJson(req);
  if (!body) return reply(origin, { error: "Bad request" }, 400);
  const ip = clientIp(req);
  const token = cleanString(body.token, 64);
  // page views of a known visitor are cheap; new chats are limited per IP
  if (!allow(`widget-session:${ip}`, token ? 120 : 20, 60 * 60_000)) return reply(origin, { error: "Too many requests." }, 429);
  const chat = await arrive({
    token: token || undefined,
    pageUrl: cleanString(body.pageUrl, 1000),
    pageTitle: cleanString(body.pageTitle, 300),
    referrer: cleanString(body.referrer, 1000),
    userAgent: req.headers.get("user-agent") ?? "",
    ip,
  });
  return reply(origin, { token: chat.token, state: await visitorState(chat) });
}

export const OPTIONS = preflight;
