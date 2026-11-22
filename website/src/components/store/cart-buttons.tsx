"use client";

import { Check, ShoppingCart, UserRound } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { cart, useCart, type CartItem } from "@/lib/cart";
import { cn } from "@/lib/utils";

/** "Add to cart" on product cards (icon) and pages (with a label); shows a tick for a moment after adding. */
export function AddToCart({ item, qty = 1, label = false, className }: { item: Omit<CartItem, "qty">; qty?: number; label?: boolean; className?: string }) {
  const inCart = useCart().some((i) => i.slug === item.slug);
  const [added, setAdded] = useState(false);
  useEffect(() => {
    if (!added) return;
    const t = setTimeout(() => setAdded(false), 1600);
    return () => clearTimeout(t);
  }, [added]);
  return (
    <button
      type="button"
      aria-label={`Add ${item.name} to the cart`}
      title={inCart ? "In your cart: add one more" : "Add to cart"}
      onClick={() => {
        cart.add(item, qty);
        setAdded(true);
      }}
      data-track="add-to-cart"
      className={cn(
        "inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg font-semibold transition-colors",
        label ? "bg-brand-900 px-5 text-sm text-white hover:bg-brand-800" : "w-10 bg-brand-900 text-white hover:bg-brand-800",
        className,
      )}
    >
      {added ? <Check className="size-4" /> : <ShoppingCart className="size-4" />}
      {label && (added ? "Added to cart" : "Add to cart")}
    </button>
  );
}

/** The cart in the header with the number of items. */
export function CartLink() {
  const n = useCart().reduce((s, i) => s + i.qty, 0);
  return (
    <Link href="/cart" aria-label={n ? `Cart, ${n} item${n === 1 ? "" : "s"}` : "Cart"} className="relative inline-flex h-10 items-center gap-3 rounded-lg px-2.5 text-ink transition-colors hover:bg-surface hover:text-brand-900">
      <span className="relative">
        <ShoppingCart className="size-5" />
        {n > 0 && <span className="absolute -top-2 -right-2.5 grid min-w-4.5 place-items-center rounded-full bg-brand-900 px-1 text-[10px] leading-4.5 font-bold text-white">{n}</span>}
      </span>
      <span className="hidden text-sm font-medium xl:inline">Cart</span>
    </Link>
  );
}

export function AccountLink() {
  return (
    <Link href="/account" aria-label="My account" className="inline-flex h-10 items-center gap-2 rounded-lg px-2.5 text-ink transition-colors hover:bg-surface hover:text-brand-900">
      <UserRound className="size-5" />
      <span className="hidden text-sm font-medium xl:inline">Account</span>
    </Link>
  );
}
