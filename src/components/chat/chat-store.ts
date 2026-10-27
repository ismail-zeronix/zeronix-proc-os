"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type ChatView = { kind: "list" } | { kind: "new" } | { kind: "channel"; id: number } | { kind: "info"; id: number };
export type ChatTab = "chats" | "threads" | "activity";

interface ChatState {
  open: boolean;
  view: ChatView;
  tab: ChatTab;
  /** Unsent text per conversation (thread drafts use minus the message id). */
  drafts: Record<number, string>;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  show: (view: ChatView) => void;
  setTab: (tab: ChatTab) => void;
  setDraft: (key: number, text: string) => void;
}

/** The chat widget's own state, kept per browser so it is the same after a reload or on the next page. */
export const useChatStore = create<ChatState>()(
  persist(
    (set) => ({
      open: false,
      view: { kind: "list" },
      tab: "chats",
      drafts: {},
      setOpen: (open) => set({ open }),
      toggle: () => set((s) => ({ open: !s.open })),
      show: (view) => set({ view, open: true }),
      setTab: (tab) => set({ tab }),
      setDraft: (key, text) =>
        set((s) => {
          const drafts = { ...s.drafts };
          if (text) drafts[key] = text;
          else delete drafts[key];
          return { drafts };
        }),
    }),
    { name: "zp-chat", storage: createJSONStorage(() => localStorage) },
  ),
);
