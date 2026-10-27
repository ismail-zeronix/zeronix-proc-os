import { loadAccess } from "@/lib/auth/session";
import { reportAway } from "@/lib/chat/presence";

/** The portal tab went to the background for a while (`{ away: true }`) or came back. A plain route, like typing. */
export async function POST(req: Request) {
  const access = await loadAccess();
  if (!access) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { away } = (await req.json().catch(() => ({}))) as { away?: unknown };
  if (typeof away !== "boolean") return Response.json({ error: "Bad request" }, { status: 400 });
  await reportAway(access.user.id, away);
  return new Response(null, { status: 204 });
}
