"use client";

import { useSyncExternalStore } from "react";

/**
 * The visitor's quote list: products they want B2B pricing on, kept in their own browser (no account, no cookie) and
 * sent with the /quote form. In the shop it becomes the cart (WEBSITE-PLAN.md section 11).
 */

export interface QuoteItem {
  slug: string;
  name: string;
  qty: number;
}

const KEY = "zx-quote-list";
const EVENT = "zx-quote-list";
const EMPTY: QuoteItem[] = [];
let cache: { raw: string | null; items: QuoteItem[] } = { raw: null, items: EMPTY };

function read(): QuoteItem[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return EMPTY;
  }
  if (raw === cache.raw) return cache.items;
  let items: QuoteItem[] = EMPTY;
  try {
    const parsed = JSON.parse(raw ?? "[]");
    if (Array.isArray(parsed)) items = parsed.filter((i) => i && typeof i.slug === "string" && typeof i.name === "string").slice(0, 30);
  } catch {
    /* damaged: start again */
  }
  cache = { raw, items };
  return items;
}

function write(items: QuoteItem[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items.slice(0, 30)));
  } catch {
    /* private window: the list lives only on this page */
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export function useQuoteList(): QuoteItem[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

export const quoteList = {
  add(item: { slug: string; name: string }) {
    const items = read();
    const found = items.find((i) => i.slug === item.slug);
    write(found ? items.map((i) => (i.slug === item.slug ? { ...i, qty: i.qty + 1 } : i)) : [...items, { ...item, qty: 1 }]);
  },
  setQty(slug: string, qty: number) {
    write(read().map((i) => (i.slug === slug ? { ...i, qty: Math.max(1, Math.min(10_000, Math.round(qty) || 1)) } : i)));
  },
  remove(slug: string) {
    write(read().filter((i) => i.slug !== slug));
  },
  clear() {
    write([]);
  },
};
