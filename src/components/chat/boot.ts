"use client";

import type { ChannelSummary, ChatPrefsView } from "@/lib/chat/types";
import type { Presence, Teammate } from "./chat-data";
import type { WebList } from "./web-data";

interface Boot {
  channels: ChannelSummary[];
  users: { users: Teammate[]; presence: Presence };
  me: ChatPrefsView;
  web: WebList;
}

let boot: Promise<Boot> | null = null;
const unused = new Set<keyof Boot>(["channels", "users", "me", "web"]);

/**
 * The widget's first load of each part comes from one request (/api/chat/boot) instead of four. Every later load (a
 * reconnect, a refetch) uses the part's own address, through `own`. If the shared request fails, `own` is used too.
 */
export function firstFromBoot<K extends keyof Boot>(part: K, own: () => Promise<Boot[K]>): Promise<Boot[K]> {
  if (!unused.has(part)) return own();
  unused.delete(part);
  boot ??= fetch("/api/chat/boot").then((r) => {
    if (!r.ok) throw new Error("boot failed");
    return r.json() as Promise<Boot>;
  });
  return boot.then((b) => b[part]).catch(() => own());
}
