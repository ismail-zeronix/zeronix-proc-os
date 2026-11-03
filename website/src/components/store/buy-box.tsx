"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { cart, type CartItem } from "@/lib/cart";
import { AddToCart } from "./cart-buttons";
import { QtyStepper } from "./cart-view";
import { aed, priceText } from "./fields";

/** Product page for products sold online: price with VAT, quantity, Add to cart and Buy now, and the B2B way out. */
export function BuyBox({ item, quoteHref, deliveryNote }: { item: Omit<CartItem, "qty">; quoteHref: string; deliveryNote?: string }) {
  const router = useRouter();
  const [qty, setQty] = useState(1);
  const price = Number(item.price);
  return (
    <div className="grid gap-4 rounded-card border border-line/70 bg-white p-5">
      <div>
        <p className="font-heading text-3xl font-medium text-ink tabular-nums">{priceText(item.price)}</p>
        <p className="text-xs text-muted-ink">
          Incl. 5% VAT ({aed(price - price / 1.05)}) · tax invoice with every order
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <QtyStepper value={qty} onChange={(n) => setQty(Math.max(1, Math.min(100, n)))} label={item.name} />
        <AddToCart item={item} qty={qty} label className="flex-1" />
        <button
          type="button"
          onClick={() => {
            cart.add(item, qty);
            router.push("/checkout");
          }}
          className="inline-flex h-10 flex-1 items-center justify-center rounded-full bg-forest-900 px-5 text-sm font-semibold text-white transition-colors hover:bg-forest-800"
          data-track="buy-now"
        >
          Buy now
        </button>
      </div>
      {deliveryNote && <p className="text-xs text-muted-ink">{deliveryNote}</p>}
      <Link href={quoteHref} className="text-xs font-semibold text-forest-800 hover:text-forest-950">
        Buying 10 or more for your company? Get a B2B quote →
      </Link>
    </div>
  );
}
