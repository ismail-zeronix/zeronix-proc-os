import { AppShell } from "@/components/app-shell";
import { punchState } from "@/lib/attendance-data";
import { requireAccess } from "@/lib/auth/session";
import { unreadTotal } from "@/lib/chat/channels";
import { waitingCount } from "@/lib/webchat/chats";

/** The Chat app: team chats and website chats on separate pages, full width and full height. */
export default async function ChatLayout({ children }: LayoutProps<"/chat">) {
  const { user, apps } = await requireAccess();
  const [{ punchedIn }, chatUnread, webWaiting] = await Promise.all([punchState(user.id), unreadTotal(user.id), apps.includes("crm") ? waitingCount() : 0]);
  return (
    <AppShell app="chat" fill badges={{ chatUnread, webWaiting }}>
      {punchedIn ? children : <p className="p-8 text-center text-sm text-muted-foreground">Punch in to use the chat: click the clock at the top of the page.</p>}
    </AppShell>
  );
}
