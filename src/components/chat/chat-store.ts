"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type ChatView = { kind: "list" } | { kind: "new" } | { kind: "channel"; id: number };

interface ChatState {
  open: boolean;
  view: ChatView;
  /** Unsent text per conversation. */
  drafts: Record<number, string>;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  show: (view: ChatView) => void;
  setDraft: (channelId: number, text: string) => void;
}

/** The chat widget's own state, kept per browser so it is the same after a reload or on the next page. */
export const useChatStore = create<ChatState>()(
  persist(
    (set) => ({
      open: false,
      view: { kind: "list" },
      drafts: {},
      setOpen: (open) => set({ open }),
      toggle: () => set((s) => ({ open: !s.open })),
      show: (view) => set({ view, open: true }),
      setDraft: (channelId, text) =>
        set((s) => {
          const drafts = { ...s.drafts };
          if (text) drafts[channelId] = text;
          else delete drafts[channelId];
          return { drafts };
        }),
    }),
    { name: "zp-chat", storage: createJSONStorage(() => localStorage) },
  ),
);
