"use client";

import { useSyncExternalStore } from "react";

/**
 * The visitor's cart: products sold online, kept in their own browser like the quote list. The price here is only what
 * the visitor saw; the portal prices the order again from its own database at checkout.
 */

export interface CartItem {
  slug: string;
  name: string;
  /** /products/category/slug */
  href: string;
  image: string | null;
  /** AED with VAT, as shown when it was added ("4489.00"). */
  price: string;
  qty: number;
}

const KEY = "zx-cart";
const EVENT = "zx-cart";
const EMPTY: CartItem[] = [];
const MAX_QTY = 100;
let cache: { raw: string | null; items: CartItem[] } = { raw: null, items: EMPTY };

function read(): CartItem[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return EMPTY;
  }
  if (raw === cache.raw) return cache.items;
  let items: CartItem[] = EMPTY;
  try {
    const parsed = JSON.parse(raw ?? "[]");
    if (Array.isArray(parsed)) items = parsed.filter((i) => i && typeof i.slug === "string" && typeof i.name === "string" && typeof i.price === "string").slice(0, 30);
  } catch {
    /* damaged: start again */
  }
  cache = { raw, items };
  return items;
}

function write(items: CartItem[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items.slice(0, 30)));
  } catch {
    /* private window: the cart lives only on this page */
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

export function useCart(): CartItem[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

const clampQty = (n: number) => Math.max(1, Math.min(MAX_QTY, Math.round(n) || 1));

export const cart = {
  add(item: Omit<CartItem, "qty">, qty = 1) {
    const items = read();
    const found = items.find((i) => i.slug === item.slug);
    write(found ? items.map((i) => (i.slug === item.slug ? { ...i, ...item, qty: clampQty(i.qty + qty) } : i)) : [...items, { ...item, qty: clampQty(qty) }]);
  },
  setQty(slug: string, qty: number) {
    write(read().map((i) => (i.slug === slug ? { ...i, qty: clampQty(qty) } : i)));
  },
  remove(slug: string) {
    write(read().filter((i) => i.slug !== slug));
  },
  clear() {
    write([]);
  },
};

/** Sum of the lines as the visitor saw them, in AED with VAT. */
export const cartTotal = (items: CartItem[]) => items.reduce((s, i) => s + Math.round(Number(i.price) * 100) * i.qty, 0) / 100;
