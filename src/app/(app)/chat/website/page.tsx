import { Suspense } from "react";
import { requireAccess } from "@/lib/auth/session";
import { WebsiteChatPage } from "./website-page";

export const metadata = { title: "Website chats · Zeronix" };

/** Chats from visitors on www.zeronix.ae: the list, the conversation and everything known about the visitor. */
export default async function WebsiteChatsRoute() {
  const { user, apps } = await requireAccess();
  if (!apps.includes("crm")) return <p className="p-8 text-center text-sm text-muted-foreground">Website chats are answered by the sales team (people with the CRM app).</p>;
  return (
    <Suspense>
      <WebsiteChatPage me={{ id: user.id, name: user.name, isAdmin: user.role === "admin" }} />
    </Suspense>
  );
}
