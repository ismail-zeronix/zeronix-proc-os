import { loadAccess } from "@/lib/auth/session";
import "@/lib/chat/presence";
import { getSetting } from "@/lib/settings";
import { listChats } from "@/lib/webchat/chats";

/** The Website tab: visitors on the site, waiting and live chats, and recent ended ones (people with the CRM app). */
export async function GET() {
  const access = await loadAccess();
  if (!access) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!access.apps.includes("crm")) return Response.json({ chats: [], ring: "off", agent: false });
  return Response.json({ chats: await listChats(access.user.id), ring: await getSetting("webchat_ring"), agent: true });
}
