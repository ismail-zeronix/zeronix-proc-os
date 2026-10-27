import { loadAccess } from "@/lib/auth/session";
import { openChannel } from "@/lib/chat/channels";
import { loadThread } from "@/lib/chat/messages";

/** A message and its thread replies. */
export async function GET(_req: Request, ctx: RouteContext<"/api/chat/messages/[id]/thread">) {
  const access = await loadAccess();
  if (!access) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const rootId = Number((await ctx.params).id);
  const thread = Number.isInteger(rootId) && rootId > 0 ? await loadThread(rootId) : null;
  if (!thread) return Response.json({ error: "Not found" }, { status: 404 });
  try {
    await openChannel(thread.root.channelId, access);
  } catch {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  return Response.json(thread);
}
