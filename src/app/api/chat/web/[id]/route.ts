import { loadAccess } from "@/lib/auth/session";
import { chatById, messagesOf, visitorInfo } from "@/lib/webchat/chats";

/** One website chat's lines, plus where the visitor came from. */
export async function GET(_req: Request, ctx: RouteContext<"/api/chat/web/[id]">) {
  const access = await loadAccess();
  if (!access) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!access.apps.includes("crm")) return Response.json({ error: "Not found" }, { status: 404 });
  const id = Number((await ctx.params).id);
  const chat = Number.isInteger(id) ? await chatById(id) : null;
  if (!chat) return Response.json({ error: "That chat is gone." }, { status: 404 });
  return Response.json({ messages: await messagesOf(chat.id, true), info: visitorInfo(chat) });
}
