"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { OfferDraft } from "@/lib/llm/schema";

interface ReviewState {
  /** In-progress review edits per price list id (kept in localStorage until saved). */
  drafts: Record<number, OfferDraft[]>;
  init: (id: number, drafts: OfferDraft[], force?: boolean) => void;
  update: (id: number, key: string, patch: Partial<OfferDraft>) => void;
  updateMany: (id: number, keys: string[], patch: Partial<OfferDraft>) => void;
  remove: (id: number) => void;
}

export const useReviewStore = create<ReviewState>()(
  persist(
    (set) => ({
      drafts: {},
      init: (id, drafts, force) =>
        set((s) => (s.drafts[id] && !force ? s : { drafts: { ...s.drafts, [id]: drafts } })),
      update: (id, key, patch) =>
        set((s) => ({
          drafts: { ...s.drafts, [id]: (s.drafts[id] ?? []).map((d) => (d.key === key ? { ...d, ...patch } : d)) },
        })),
      updateMany: (id, keys, patch) =>
        set((s) => {
          const ks = new Set(keys);
          return {
            drafts: { ...s.drafts, [id]: (s.drafts[id] ?? []).map((d) => (ks.has(d.key) ? { ...d, ...patch } : d)) },
          };
        }),
      remove: (id) =>
        set((s) => {
          const next = { ...s.drafts };
          delete next[id];
          return { drafts: next };
        }),
    }),
    { name: "zp-review-drafts", storage: createJSONStorage(() => localStorage) },
  ),
);

/** Paste form state survives navigation so a half-pasted list is not lost. */
interface PasteState {
  rawText: string;
  supplierId: string;
  newSupplierName: string;
  receivedAt: string;
  set: (p: Partial<Omit<PasteState, "set" | "reset">>) => void;
  reset: () => void;
}

export const usePasteStore = create<PasteState>()(
  persist(
    (set) => ({
      rawText: "",
      supplierId: "",
      newSupplierName: "",
      receivedAt: "",
      set: (p) => set(p),
      reset: () => set({ rawText: "", supplierId: "", newSupplierName: "", receivedAt: "" }),
    }),
    { name: "zp-paste", storage: createJSONStorage(() => sessionStorage) },
  ),
);
