import "server-only";
import { chatByToken } from "./chats";
import { allow, clientIp, originOf, readJson, reply } from "./public";

type Chat = NonNullable<Awaited<ReturnType<typeof chatByToken>>>;

/**
 * Wraps a widget POST endpoint: checks the calling site, reads the JSON body, finds the visitor's chat by its token and
 * rate limits by IP. The handler's errors are shown to the visitor as they are.
 */
export function visitorPost(
  handle: (ctx: { chat: Chat; body: Record<string, unknown>; ip: string }) => Promise<unknown>,
  limit: { max: number; windowMs: number } = { max: 40, windowMs: 60_000 },
) {
  return async (req: Request): Promise<Response> => {
    const origin = originOf(req);
    if (origin === null) return new Response(null, { status: 403 });
    const ip = clientIp(req);
    if (!allow(`${new URL(req.url).pathname}:${ip}`, limit.max, limit.windowMs)) return reply(origin, { error: "Too many requests. Please wait a moment." }, 429);
    const body = await readJson(req);
    if (!body) return reply(origin, { error: "Bad request" }, 400);
    const chat = typeof body.token === "string" ? await chatByToken(body.token) : null;
    if (!chat) return reply(origin, { error: "This chat has expired. Please reload the page." }, 404);
    try {
      return reply(origin, (await handle({ chat, body, ip })) ?? { ok: true });
    } catch (e) {
      return reply(origin, { error: (e as Error).message }, 400);
    }
  };
}
