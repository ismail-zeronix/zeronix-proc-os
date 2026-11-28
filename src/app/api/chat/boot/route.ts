import { loadAccess } from "@/lib/auth/session";
import { listChannelsFor, listTeammates } from "@/lib/chat/channels";
import { prefsOf, presenceMap } from "@/lib/chat/presence";
import { getSetting } from "@/lib/settings";
import { listChats } from "@/lib/webchat/chats";

/**
 * Everything the chat widget needs when a page opens, in one request instead of four: my conversations, teammates and
 * how they show, my chat settings, and (people with the CRM app) the website chats. Later reloads of each part use their
 * own address (/api/chat/channels, /users, /me, /web).
 */
export async function GET() {
  const access = await loadAccess();
  if (!access) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const me = access.user.id;
  const agent = access.apps.includes("crm");
  const [channels, users, presence, prefs, web] = await Promise.all([
    listChannelsFor(me),
    listTeammates(me),
    presenceMap(),
    prefsOf(me),
    agent
      ? Promise.all([listChats(me), getSetting("webchat_ring")]).then(([chats, ring]) => ({ chats, ring, agent: true }))
      : { chats: [], ring: "off", agent: false },
  ]);
  return Response.json({ channels, users: { users, presence }, me: prefs, web });
}
