"use client";

import { Minus, Plus, ShoppingCart, Trash2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Action } from "@/components/brand/action";
import { cart, cartTotal, useCart } from "@/lib/cart";
import { priceText, Totals } from "./fields";

/** Quantity stepper used by the cart and the product buy box. */
export function QtyStepper({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  return (
    <span className="inline-flex h-10 items-center rounded-full border border-line bg-white">
      <button type="button" onClick={() => onChange(value - 1)} disabled={value <= 1} aria-label={`One less ${label}`} className="grid size-10 place-items-center text-forest-900 disabled:opacity-30">
        <Minus className="size-4" />
      </button>
      <input
        aria-label={`How many ${label}`}
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(Number(e.target.value.replace(/\D/g, "")) || 1)}
        className="w-9 bg-transparent text-center text-sm font-semibold tabular-nums outline-none"
      />
      <button type="button" onClick={() => onChange(value + 1)} disabled={value >= 100} aria-label={`One more ${label}`} className="grid size-10 place-items-center text-forest-900 disabled:opacity-30">
        <Plus className="size-4" />
      </button>
    </span>
  );
}

export function CartView() {
  const items = useCart();
  if (!items.length) {
    return (
      <div className="grid justify-items-center gap-3 rounded-card border border-line/70 bg-white px-5 py-12 text-center">
        <ShoppingCart className="size-8 text-forest-700" strokeWidth={1.5} />
        <p className="text-lg font-semibold text-ink">Your cart is empty</p>
        <p className="max-w-sm text-sm text-muted-ink">Add laptops, desktops, monitors and accessories with a price. For servers and bulk orders, ask us for a B2B quote.</p>
        <div className="flex flex-wrap justify-center gap-2">
          <Action href="/products">Shop products</Action>
          <Action href="/quote" variant="outline" arrow={false}>
            Get a B2B quote
          </Action>
        </div>
      </div>
    );
  }
  const total = cartTotal(items);
  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <ul className="grid gap-2.5">
        {items.map((i) => (
          <li key={i.slug} className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-3 rounded-card border border-line/70 bg-white p-3 sm:grid-cols-[5.5rem_minmax(0,1fr)_auto] sm:items-center">
            <Link href={i.href} className="relative aspect-square overflow-hidden rounded-inner bg-white">
              {i.image ? <Image src={i.image} alt="" fill sizes="88px" className="object-contain p-1" /> : <span className="grid h-full place-items-center bg-sage-50 text-xs text-muted-ink">No photo</span>}
            </Link>
            <div className="grid min-w-0 gap-1">
              <Link href={i.href} className="line-clamp-2 text-sm leading-snug font-semibold text-ink hover:text-forest-700">
                {i.name}
              </Link>
              <span className="text-sm font-bold text-ink tabular-nums">{priceText(i.price)}</span>
            </div>
            <div className="col-span-2 flex items-center justify-between gap-3 sm:col-span-1 sm:justify-end">
              <QtyStepper value={i.qty} onChange={(n) => cart.setQty(i.slug, n)} label={i.name} />
              <button type="button" onClick={() => cart.remove(i.slug)} aria-label={`Remove ${i.name}`} className="grid size-10 place-items-center rounded-full text-muted-ink transition-colors hover:bg-sage-100 hover:text-forest-900">
                <Trash2 className="size-4" />
              </button>
            </div>
          </li>
        ))}
      </ul>
      <aside className="grid gap-4 rounded-card border border-line/70 bg-white p-4 lg:sticky lg:top-32">
        <h2 className="text-base font-semibold text-ink">Order summary</h2>
        <Totals total={total} note="Prices include 5% VAT. Final prices are confirmed at checkout." />
        <Action href="/checkout" className="justify-center">
          Checkout
        </Action>
        <Link href="/quote" className="text-center text-xs font-semibold text-forest-800 hover:text-forest-950">
          Buying 10 or more? Get a B2B quote
        </Link>
      </aside>
    </div>
  );
}
