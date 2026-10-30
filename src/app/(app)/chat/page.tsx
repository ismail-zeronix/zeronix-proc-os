import { requireAccess } from "@/lib/auth/session";
import { ChatPage } from "./chat-page";

export const metadata = { title: "Team chats · Zeronix" };

/** Team chats: direct messages, channels, deal threads and the Activity feed. Website visitors have their own page. */
export default async function ChatRoute() {
  const { user } = await requireAccess();
  return <ChatPage me={{ id: user.id, name: user.name, isAdmin: user.role === "admin" }} />;
}
