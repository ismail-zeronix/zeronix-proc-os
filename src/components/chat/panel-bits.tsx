"use client";

import { ArrowLeft, Handshake, Hash, Lock, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/user-avatar";
import type { ChannelSummary } from "@/lib/chat/types";
import { useChatStore } from "./chat-store";

/** A conversation's picture: the person for a DM, # for a channel, a handshake for a deal thread. */
export function ChannelAvatar({ channel, online, size }: { channel: ChannelSummary; online: Set<number>; size: number }) {
  if (channel.kind === "dm") return <PresenceAvatar name={channel.name} online={!!channel.peer && online.has(channel.peer.id)} size={size} />;
  const Icon = channel.kind === "record" ? Handshake : channel.isPrivate ? Lock : Hash;
  return (
    <span className="flex shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground" style={{ width: size, height: size }}>
      <Icon className="size-[45%]" />
    </span>
  );
}

export function PresenceAvatar({ name, online, size }: { name: string; online: boolean; size: number }) {
  return (
    <span className="relative shrink-0">
      <UserAvatar name={name} size={size} />
      {online && <span className="absolute right-0 bottom-0 size-2.5 rounded-full bg-emerald-500 ring-2 ring-popover" aria-label="Online" />}
    </span>
  );
}

/** Close button shared by every panel header. */
function MinimiseButton() {
  const setOpen = useChatStore((s) => s.setOpen);
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
