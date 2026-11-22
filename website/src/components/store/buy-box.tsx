"use client";

import { ReceiptText, ShieldCheck, ShoppingCart, Truck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { cart, type CartItem } from "@/lib/cart";
import { useStoreInfo } from "@/lib/store-info";
import { StockLabel, type Stock } from "./stock";
import { AddToCart } from "./cart-buttons";
import { QtyStepper } from "./cart-view";
import { aed, priceText } from "./fields";

const TRUST = [
  { icon: Truck, text: "Delivery across the UAE" },
  { icon: ShieldCheck, text: "Official UAE warranty" },
  { icon: ReceiptText, text: "VAT tax invoice" },
];

/**
 * Product page for products sold online: price with VAT, quantity, Add to cart and Buy now, the trust row and the B2B
 * way out. On phones the buttons live in a bar fixed to the bottom of the screen (price, Add to cart, Buy now), the
 * app-store pattern; the page hides the tab bar so the two never stack.
 */
export function BuyBox({ item, quoteHref, stock }: { item: Omit<CartItem, "qty">; quoteHref: string; stock?: Stock }) {
  const router = useRouter();
  const store = useStoreInfo();
  const rules = store?.delivery;
  const [qty, setQty] = useState(1);
  const price = Number(item.price);
  const buyNow = () => {
    cart.add(item, qty);
    router.push("/checkout");
  };

  return (
    <>
      <div className="grid gap-4 rounded-card border border-line/70 bg-white p-4 sm:p-5">
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-heading text-2xl font-semibold tracking-tight text-ink tabular-nums sm:text-3xl">{priceText(item.price)}</p>
            {stock && <StockLabel value={stock} className="rounded-full bg-surface-soft px-2.5 py-1 text-xs" />}
          </div>
          <p className="text-xs text-muted-ink">
            Incl. 5% VAT ({aed(price - price / 1.05)}) · tax invoice with every order
          </p>
        </div>
        {/* phones: quantity only (the buttons are in the bottom bar); from sm: quantity and both buttons */}
        <div className="flex items-center gap-3 sm:grid sm:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)] sm:gap-2">
          <span className="text-sm text-muted-ink sm:hidden">Quantity</span>
          <QtyStepper value={qty} onChange={(n) => setQty(Math.max(1, Math.min(100, n)))} label={item.name} />
          <AddToCart item={item} qty={qty} label className="hidden h-11 whitespace-nowrap sm:inline-flex" />
          <button type="button" onClick={buyNow} className="hidden h-11 items-center justify-center rounded-lg bg-brand-900 px-5 text-sm font-semibold whitespace-nowrap text-white transition-colors hover:bg-brand-800 sm:inline-flex" data-track="buy-now">
            Buy now
          </button>
        </div>
        <ul className="grid grid-cols-3 gap-2 border-t border-line/70 pt-4">
          {TRUST.map((t) => (
            <li key={t.text} className="flex flex-col items-center gap-1.5 text-center text-[0.6875rem] leading-tight text-muted-ink sm:flex-row sm:text-left sm:text-xs">
              <t.icon className="size-4 shrink-0 text-brand-700" strokeWidth={1.75} />
              {t.text}
            </li>
          ))}
        </ul>
        {rules && (rules.fee > 0 || Object.keys(rules.emirateFees ?? {}).length > 0) && (
          <p className="-mt-1 text-xs text-muted-ink">
            {rules.freeAbove > 0 ? (
              price * qty >= rules.freeAbove ? (
                <span className="font-semibold text-brand-700">This order delivers free.</span>
              ) : (
                <>Free delivery on orders from {priceText(rules.freeAbove.toFixed(2))}. </>
              )
            ) : null}
            {!(rules.freeAbove > 0 && price * qty >= rules.freeAbove) && rules.fee > 0 && <>Otherwise {priceText(rules.fee.toFixed(2))} delivery.</>}
          </p>
        )}
        {rules && rules.fee === 0 && !Object.keys(rules.emirateFees ?? {}).length && <p className="-mt-1 text-xs font-semibold text-brand-700">Free delivery across the UAE</p>}
        <Link href={quoteHref} className="text-xs font-semibold text-brand-700 hover:text-brand-950">
          Buying 10 or more for your company? Get a B2B quote →
        </Link>
      </div>

      {/* phones: the buy bar, always at the bottom of the screen */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 px-3 pt-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom))] backdrop-blur-xl sm:hidden">
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 leading-tight">
            <span className="block text-base font-bold text-ink tabular-nums">{priceText(item.price)}</span>
            <span className="block text-[0.6875rem] text-muted-ink">{qty > 1 ? `${qty} × incl. VAT` : "Incl. VAT"}</span>
          </p>
          <AddToCart item={item} qty={qty} className="size-11 border border-brand-900 bg-white text-brand-900 hover:bg-surface" />
          <button type="button" onClick={buyNow} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-brand-900 px-6 text-sm font-semibold whitespace-nowrap text-white transition-colors hover:bg-brand-800" data-track="buy-now-bar">
            <ShoppingCart className="size-4" /> Buy now
          </button>
        </div>
      </div>
    </>
  );
}
