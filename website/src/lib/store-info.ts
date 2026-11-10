"use client";

import { useEffect, useState } from "react";

/**
 * Checkout options from the portal (/api/store): ways to pay, bank details, the delivery note and charges. Fetched once
 * per page view and shared by the cart, checkout and the order page. The delivery charge shown here is a preview; the
 * portal works it out again when the order is placed (src/lib/website/store-core.ts deliveryFee, the same rules).
 */

export type Payment = "request" | "cod" | "bank";

export interface DeliveryRules {
  fee: number;
  freeAbove: number;
  emirateFees: Partial<Record<string, number>>;
}

export interface StoreInfo {
  payments: Payment[];
  bankDetails: string;
  deliveryNote: string;
  delivery?: DeliveryRules;
  signIn: boolean;
}

let pending: Promise<StoreInfo | null> | null = null;

function load(): Promise<StoreInfo | null> {
  pending ??= fetch("/api/store")
    .then((r) => (r.ok ? (r.json() as Promise<StoreInfo>) : null))
    .catch(() => null)
    .then((s) => {
      if (!s) pending = null; // try again on the next mount
      return s;
    });
  return pending;
}

export function useStoreInfo(): StoreInfo | null {
  const [info, setInfo] = useState<StoreInfo | null>(null);
  useEffect(() => {
    let live = true;
    void load().then((s) => live && setInfo(s));
    return () => {
      live = false;
    };
  }, []);
  return info;
}

/** The delivery charge for this cart, AED incl. VAT; mirrors the portal's rule. */
export function deliveryFee(rules: DeliveryRules | undefined, goods: number, delivery: "delivery" | "pickup", emirate = ""): number {
  if (!rules || delivery === "pickup") return 0;
  if (rules.freeAbove > 0 && goods >= rules.freeAbove) return 0;
  const own = rules.emirateFees?.[emirate];
  return Math.max(0, typeof own === "number" && own >= 0 ? own : rules.fee);
}

/** How much more the cart needs for free delivery; null when there is no free-delivery amount or delivery is free anyway. */
export function toFreeDelivery(rules: DeliveryRules | undefined, goods: number): number | null {
  if (!rules || rules.freeAbove <= 0) return null;
  const anyFee = rules.fee > 0 || Object.values(rules.emirateFees ?? {}).some((v) => (v ?? 0) > 0);
  if (!anyFee) return null;
  return Math.max(0, rules.freeAbove - goods);
}
