"use client";

import { MessagesSquare } from "lucide-react";
import { useEffect, useState } from "react";
import { firstTouch } from "@/lib/track";

declare global {
  interface Window {
    ZeronixChat?: { open: (o: { message?: string; context?: Record<string, string> }) => void; online: () => boolean };
  }
}

/**
 * "Chat with sales": opens the portal's chat widget with the first message ready and what the visitor was looking at,
 * so sales see the industry and product on the chat. Hidden until the widget has loaded (it may be blocked).
 */
export function ChatNowButton({ message, context, className }: { message: string; context: Record<string, string>; className?: string }) {
  const [ready, setReady] = useState(false);
  const [online, setOnline] = useState(false);
  useEffect(() => {
    const check = () => {
      if (!window.ZeronixChat) return false;
      setReady(true);
      setOnline(window.ZeronixChat.online());
      return true;
    };
    if (check()) return;
    const t = setInterval(() => check() && clearInterval(t), 1000);
    return () => clearInterval(t);
  }, []);
  if (!ready) return null;
  return (
    <button
      type="button"
      data-track="chat-now"
      onClick={() => {
        const first = firstTouch();
        const all = { ...context, page: location.pathname, landing: first?.path ?? "", referrer: first?.ref ?? "" };
        window.ZeronixChat?.open({ message, context: Object.fromEntries(Object.entries(all).filter(([, v]) => v)) });
      }}
      className={`inline-flex h-11 items-center gap-2 rounded-full bg-brand-900 px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-800 ${className ?? ""}`}
    >
      <MessagesSquare className="size-4" />
      Chat with sales
      {online && <span className="size-2 rounded-full bg-cta" aria-label="online now" />}
    </button>
  );
}
