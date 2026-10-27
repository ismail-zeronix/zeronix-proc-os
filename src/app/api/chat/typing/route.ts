import { loadAccess } from "@/lib/auth/session";
import { publish } from "@/lib/chat/bus";
import { memberIds } from "@/lib/chat/channels";

/**
 * "Someone is typing": the widget calls this every few seconds while you type. A plain route rather than a server
 * action, because the browser runs server actions one after another and this must never hold up sending.
 */
export async function POST(req: Request) {
  const access = await loadAccess();
  if (!access) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { channelId } = (await req.json().catch(() => ({}))) as { channelId?: unknown };
  if (typeof channelId !== "number" || !Number.isInteger(channelId)) return Response.json({ error: "Bad request" }, { status: 400 });
  const members = await memberIds(channelId);
  if (!members.includes(access.user.id)) return Response.json({ error: "Not found" }, { status: 404 });
  await publish(
    members.filter((m) => m !== access.user.id),
    { t: "typing", channelId, userId: access.user.id, name: access.user.name },
  );
  return new Response(null, { status: 204 });
}
