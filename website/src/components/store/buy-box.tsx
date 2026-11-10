"use client";

import { ReceiptText, ShieldCheck, Truck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cart, type CartItem } from "@/lib/cart";
import { useStoreInfo } from "@/lib/store-info";
import { cn } from "@/lib/utils";
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
 * way out. On phones a slim bar with the price and Add to cart stays at the bottom once the box has scrolled away.
 */
export function BuyBox({ item, quoteHref, stock }: { item: Omit<CartItem, "qty">; quoteHref: string; stock?: Stock }) {
  const router = useRouter();
  const store = useStoreInfo();
  const rules = store?.delivery;
  const [qty, setQty] = useState(1);
  const price = Number(item.price);
  const box = useRef<HTMLDivElement>(null);
  const [away, setAway] = useState(false);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    // only once the box is above the screen (scrolled past), not while it is still below it. A scroll check rather than
    // an IntersectionObserver: a jump straight past the box (a fling, a #specs link) never crosses it, so no callback.
    let frame = 0;
    const check = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setAway(el.getBoundingClientRect().bottom < 0));
    };
    check();
    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
    };
  }, []);

  return (
    <>
      <div ref={box} className="grid gap-4 rounded-card border border-line/70 bg-white p-4 sm:p-5">
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-heading text-3xl font-semibold tracking-tight text-ink tabular-nums">{priceText(item.price)}</p>
            {stock && <StockLabel value={stock} className="rounded-full bg-surface-soft px-2.5 py-1 text-xs" />}
          </div>
          <p className="text-xs text-muted-ink">
            Incl. 5% VAT ({aed(price - price / 1.05)}) · tax invoice with every order
          </p>
        </div>
        <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2 sm:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)]">
          <QtyStepper value={qty} onChange={(n) => setQty(Math.max(1, Math.min(100, n)))} label={item.name} />
          <AddToCart item={item} qty={qty} label className="h-11 whitespace-nowrap" />
          <button
            type="button"
            onClick={() => {
              cart.add(item, qty);
              router.push("/checkout");
            }}
            className="col-span-2 inline-flex h-11 items-center justify-center rounded-full bg-brand-900 px-5 text-sm font-semibold whitespace-nowrap text-white transition-colors hover:bg-brand-800 sm:col-span-1"
            data-track="buy-now"
          >
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

      {/* phones: price + Add to cart at the bottom once the box is off screen; room on the right for the chat button */}
      <div
        inert={!away}
        className={cn(
          "fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 py-2.5 pr-20 pl-3 backdrop-blur transition-[translate,visibility] duration-200 lg:hidden",
          away ? "visible translate-y-0" : "pointer-events-none invisible translate-y-full",
        )}
      >
        <div className="flex items-center justify-between gap-3">
          <p className="min-w-0 leading-tight">
            <span className="block truncate text-xs text-muted-ink">{item.name}</span>
            <span className="text-base font-bold text-ink tabular-nums">{priceText(item.price)}</span>
          </p>
          <AddToCart item={item} qty={qty} label className="h-10 px-4 whitespace-nowrap" />
        </div>
      </div>
    </>
  );
}
