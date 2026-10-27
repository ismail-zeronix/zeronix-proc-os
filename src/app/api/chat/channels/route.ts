import { loadAccess } from "@/lib/auth/session";
import { listChannelsFor } from "@/lib/chat/channels";

/** The signed-in user's conversations with unread counts (the widget's list). */
export async function GET() {
  const access = await loadAccess();
  if (!access) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json({ channels: await listChannelsFor(access.user.id) });
}
