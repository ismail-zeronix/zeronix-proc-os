"use client";

import { ArrowLeft, Handshake, Hash, Lock, Minus } from "lucide-react";
import { createContext, useContext } from "react";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/user-avatar";
import type { ChannelSummary, PresenceStatus } from "@/lib/chat/types";
import type { Presence } from "./chat-data";
import { useChatStore } from "./chat-store";

/** A conversation's picture: the person for a DM, # for a channel, a handshake for a deal thread. */
export function ChannelAvatar({ channel, presence, size }: { channel: ChannelSummary; presence: Presence; size: number }) {
  if (channel.kind === "dm") return <PresenceAvatar name={channel.name} status={channel.peer ? presence[channel.peer.id] : undefined} size={size} />;
  const Icon = channel.kind === "record" ? Handshake : channel.isPrivate ? Lock : Hash;
  return (
    <span className="flex shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground" style={{ width: size, height: size }}>
      <Icon className="size-[45%]" />
    </span>
  );
}

/** online green, away amber, do not disturb red; nothing when offline. */
export const STATUS_DOT: Record<PresenceStatus, string> = { online: "bg-emerald-500", away: "bg-amber-400", dnd: "bg-red-500", offline: "" };
export const STATUS_LABEL: Record<PresenceStatus, string> = { online: "Online", away: "Away", dnd: "Do not disturb", offline: "Offline" };

export function PresenceAvatar({ name, status, size }: { name: string; status?: PresenceStatus; size: number }) {
  return (
    <span className="relative shrink-0">
      <UserAvatar name={name} size={size} />
      {status && status !== "offline" && (
        <span className={`absolute right-0 bottom-0 size-2.5 rounded-full ring-2 ring-popover ${STATUS_DOT[status]}`} aria-label={STATUS_LABEL[status]} title={STATUS_LABEL[status]} />
      )}
    </span>
  );
}

/** Where the chat is drawn: the floating widget, or the full /chat page (no minimise button there). */
export const ChatSurface = createContext<"widget" | "page">("widget");

/** Close button shared by every panel header. */
function MinimiseButton() {
  const setOpen = useChatStore((s) => s.setOpen);
  if (useContext(ChatSurface) === "page") return null;
  return (
    <Button variant="ghost" size="icon-sm" onClick={() => setOpen(false)} aria-label="Minimise chat" title="Minimise (Esc)">
      <Minus />
    </Button>
  );
}

export function PanelHeader({ title, onBack, children }: { title?: React.ReactNode; onBack?: () => void; children?: React.ReactNode }) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b px-2">
      {onBack && (
        <Button variant="ghost" size="icon-sm" onClick={onBack} aria-label="Back to conversations">
          <ArrowLeft />
        </Button>
      )}
      {title && <div className="min-w-0 flex-1 truncate pl-1 text-sm font-medium">{title}</div>}
      {children}
      <MinimiseButton />
    </header>
  );
}
