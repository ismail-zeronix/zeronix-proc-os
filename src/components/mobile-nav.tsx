"use client";

import { Bell, CheckSquare, Home, Menu, MessageCircle, type LucideIcon } from "lucide-react";
import type { NavPerms } from "@/lib/app-nav";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { useChannels } from "@/components/chat/chat-data";
import { useChatStore } from "@/components/chat/chat-store";
import { webBadge } from "@/components/chat/web-chat";
import { useWebChats } from "@/components/chat/web-data";
import { MobileMenu } from "@/components/mobile-menu";
import { useBell } from "@/components/notifications/data";
import type { AppKey, Role } from "@/lib/apps";

/**
 * The bottom bar on phones (below md): Home, Chat, Tasks, Alerts and Menu (the current app's pages, all apps, account).
 * It replaces the round chat button and the sidebar drawer there; desktop keeps the sidebar and header as they are.
 * Marked data-mobile-nav: globals.css then sets --mobile-nav-h so bottom bars and full-height pages sit above it.
 */
export function MobileNav({
  user,
  apps,
  visible,
  punchedIn,
  perms,
}: {
  user: { name: string; email: string; role: Role };
  /** Every app the user may open. */
  apps: AppKey[];
  /** Apps for the switcher grid, in order. */
  visible: string[];
  punchedIn: boolean;
  /** Extra permissions that show hidden menu groups (Accounts › Accountant). */
  perms?: NavPerms;
}) {
  const pathname = usePathname();
  const [menu, setMenu] = useState(false);
  const chatOpen = useChatStore((s) => s.open);
  const setChatOpen = useChatStore((s) => s.setOpen);
  const bell = useBell();
  const onChatPage = pathname.startsWith("/chat");
  // the panel only covers the page where the chat widget is mounted (punched in, not on the chat page)
  const panel = punchedIn && chatOpen && !onChatPage;

  const at = (base: string) => pathname === base || pathname.startsWith(base + "/");
  const home = pathname === "/";
  const tasks = at("/tasks");
  const alerts = at("/notifications");
  const chat = panel || onChatPage;

  // every tab closes the chat panel and the menu first, so the tab tapped is what shows
  const leave = () => {
    if (chatOpen) setChatOpen(false);
    setMenu(false);
  };

  return (
    <>
      <nav
        data-mobile-nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-50 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        <ul className="mx-auto grid h-14 max-w-lg auto-cols-fr grid-flow-col">
          <Tab href="/" label="Home" icon={Home} active={home && !panel && !menu} onClick={leave} allow />
          {punchedIn && (
            <li className="contents">
              {onChatPage ? (
                <Tab href="/chat" label="Chat" icon={MessageCircle} active={!menu} onClick={leave} badge={<ChatBadge />} bare />
              ) : (
                <TabButton
                  label="Chat"
                  icon={MessageCircle}
                  active={panel && !menu}
                  onClick={() => {
                    setMenu(false);
                    setChatOpen(!chatOpen);
                  }}
                  badge={<ChatBadge />}
                />
              )}
            </li>
          )}
          {apps.includes("tasks") && <Tab href="/tasks" label="Tasks" icon={CheckSquare} active={tasks && !panel && !menu} onClick={leave} />}
          <Tab
            href="/notifications"
            label="Alerts"
            icon={Bell}
            active={alerts && !panel && !menu}
            onClick={leave}
            allow
            badge={<Count n={bell.data?.unread ?? 0} urgent={bell.data?.critical} />}
          />
          <li className="contents">
            <TabButton
              label="Menu"
              icon={Menu}
              allow
              active={menu || (!home && !tasks && !alerts && !chat)}
              onClick={() => {
                if (chatOpen) setChatOpen(false);
                setMenu(!menu);
              }}
            />
          </li>
        </ul>
      </nav>
      <MobileMenu open={menu} onOpenChange={setMenu} user={user} visible={visible} punchedIn={punchedIn} perms={perms} />
    </>
  );
}

const TAB =
  "relative flex h-full min-w-0 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors focus-visible:bg-muted focus-visible:outline-none";

function Indicator({ active }: { active: boolean }) {
  return <span aria-hidden className={`absolute top-0 h-0.5 w-8 rounded-b-full bg-primary transition-opacity ${active ? "opacity-100" : "opacity-0"}`} />;
}

function Tab({
  href,
  label,
  icon: Icon,
  active,
  onClick,
  badge,
  allow,
  bare,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  onClick: () => void;
  badge?: React.ReactNode;
  /** Works before punching in (like the header's home link and bell). */
  allow?: boolean;
  /** Already inside an <li>. */
  bare?: boolean;
}) {
  const link = (
    <Link
      href={href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      data-punch-allow={allow || undefined}
      className={`${TAB} ${active ? "text-primary" : "text-muted-foreground"}`}
    >
      <Indicator active={active} />
      <span className="relative">
        <Icon className="size-5" strokeWidth={active ? 2.25 : 1.75} />
        {badge}
      </span>
      {label}
    </Link>
  );
  return bare ? link : <li className="contents">{link}</li>;
}

function TabButton({
  label,
  icon: Icon,
  active,
  onClick,
  badge,
  allow,
}: {
  label: string;
  icon: LucideIcon;
  active: boolean;
  onClick: () => void;
  badge?: React.ReactNode;
  allow?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      data-punch-allow={allow || undefined}
      className={`${TAB} ${active ? "text-primary" : "text-muted-foreground"}`}
    >
      <Indicator active={active} />
      <span className="relative">
        <Icon className="size-5" strokeWidth={active ? 2.25 : 1.75} />
        {badge}
      </span>
      {label}
    </button>
  );
}

const noop = () => () => {};

function Count({ n, urgent }: { n: number; urgent?: boolean }) {
  // The header's bell fills the shared query from the server's data. In the browser it renders before this bar; on the
  // server it can render after. Wait until hydration is over, so both draw the same thing first.
  const ready = useSyncExternalStore(noop, () => true, () => false);
  if (!ready || n <= 0) return null;
  return (
    <span
      className={`absolute -top-1.5 left-3 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-none font-semibold ring-2 ring-background ${urgent ? "bg-destructive text-white" : "bg-primary text-primary-foreground"}`}
    >
      <span className="sr-only">, </span>
      {n > 99 ? "99+" : n}
      <span className="sr-only"> new</span>
    </span>
  );
}

/** Unread team chats plus website visitors waiting, counted the same way as the chat button on desktop. */
function ChatBadge() {
  const channels = useChannels();
  const web = useWebChats();
  const unread = (channels.data ?? []).reduce((n, c) => n + (c.muted ? 0 : c.unread), 0) + webBadge(web.data?.chats ?? []);
  return <Count n={unread} urgent />;
}
