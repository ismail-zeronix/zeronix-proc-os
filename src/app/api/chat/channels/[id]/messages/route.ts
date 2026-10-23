import { type NextRequest } from "next/server";
import { loadAccess } from "@/lib/auth/session";
import { assertMember, membersOf } from "@/lib/chat/channels";
import { loadMessages } from "@/lib/chat/messages";

/** A page of a conversation (`?before=<message id>` for older ones), with who is in it and how far each has read. */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/chat/channels/[id]/messages">) {
  const access = await loadAccess();
  if (!access) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const channelId = Number((await ctx.params).id);
  const before = Number(req.nextUrl.searchParams.get("before") ?? 0);
  if (!Number.isInteger(channelId) || channelId < 1) return Response.json({ error: "Not found" }, { status: 404 });
  try {
    await assertMember(channelId, access.user.id);
  } catch {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  const [page, members] = await Promise.all([
    loadMessages(channelId, { before: Number.isInteger(before) && before > 0 ? before : undefined }),
    membersOf(channelId),
  ]);
  return Response.json({ ...page, members });
}
