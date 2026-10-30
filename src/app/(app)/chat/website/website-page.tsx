"use client";

import { Globe } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import type { Me } from "@/components/chat/message-row";
import { ChatSurface } from "@/components/chat/panel-bits";
import { WebChatList, WebConversation } from "@/components/chat/web-chat";
import { useWebChats } from "@/components/chat/web-data";
import { WebVisitorPanel } from "@/components/chat/web-visitor-panel";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

/**
 * Website chats on a full page: visitors on the left, the open chat in the middle, everything known about the visitor
 * on the right (a drawer on narrower screens). The open chat is in the address (?c=12), so it survives a reload.
 */
export function WebsiteChatPage({ me }: { me: Me }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const selected = Number(params.get("c")) || null;
  const [details, setDetails] = useState(false);
  const web = useWebChats();
  const chats = web.data?.chats ?? [];
  const onSite = chats.filter((c) => c.online && c.status !== "closed").length;
  const select = (id: number | null) => router.replace(id ? `${pathname}?c=${id}` : pathname, { scroll: false });

  return (
    <ChatSurface.Provider value="page">
      <div className="grid min-h-0 w-full flex-1 grid-cols-[minmax(0,1fr)] md:grid-cols-[20rem_minmax(0,1fr)] xl:grid-cols-[20rem_minmax(0,1fr)_24rem] 2xl:grid-cols-[24rem_minmax(0,1fr)_28rem]">
        <aside className={`flex min-h-0 flex-col overflow-hidden rounded-xl border bg-card md:rounded-r-none ${selected ? "max-md:hidden" : ""}`}>
          <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
            <Globe className="size-4 text-muted-foreground" />
            <h1 className="flex-1 text-sm font-semibold">Website chats</h1>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground" title="Visitors with the website open now">
              <span className={`size-2 rounded-full ${onSite ? "bg-emerald-500" : "bg-muted-foreground/40"}`} />
              {onSite} on the site
            </span>
          </header>
          <WebChatList me={me} onOpen={select} selectedId={selected} searchable />
        </aside>

        <section
          className={`flex min-h-0 flex-col overflow-hidden rounded-xl border bg-card md:rounded-l-none md:border-l-0 ${selected ? "xl:rounded-r-none" : "max-md:hidden xl:col-span-2"}`}
        >
          {selected ? (
            <WebConversation key={selected} id={selected} me={me} detailsBeside onBack={() => select(null)} onDetails={() => setDetails(true)} />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center text-sm text-muted-foreground">
              <Globe className="size-10" />
              Pick a visitor on the left. New visitors ring on every page of the portal until someone accepts them.
            </div>
          )}
        </section>

        {selected && (
          <aside className="hidden min-h-0 flex-col overflow-hidden rounded-r-xl border border-l-0 bg-card xl:flex" aria-label="Visitor details">
            <WebVisitorPanel id={selected} />
          </aside>
        )}
      </div>

      {/* below xl the details open as a drawer from the chat header */}
      <Sheet open={details && !!selected} onOpenChange={setDetails}>
        <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
          <SheetTitle className="sr-only">Visitor details</SheetTitle>
          {selected && <WebVisitorPanel id={selected} />}
        </SheetContent>
      </Sheet>
    </ChatSurface.Provider>
  );
}
