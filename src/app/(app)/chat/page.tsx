import { PortalHeader } from "@/components/portal-header";
import { punchState } from "@/lib/attendance-data";
import { requireAccess } from "@/lib/auth/session";
import { ChatPage } from "./chat-page";

export const metadata = { title: "Chat · Zeronix" };

/** The team chat on a full page: conversations on the left with search, the open one on the right. */
export default async function ChatRoute() {
  const { user } = await requireAccess();
  const { punchedIn } = await punchState(user.id);
  return (
    <div className="flex h-svh flex-col">
      <PortalHeader />
      {punchedIn ? (
        <ChatPage me={{ id: user.id, name: user.name, isAdmin: user.role === "admin" }} />
      ) : (
        <p className="p-8 text-center text-sm text-muted-foreground">Punch in to use the chat: click the clock at the top of the page.</p>
      )}
    </div>
  );
}
