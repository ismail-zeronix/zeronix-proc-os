"use client";

import { Home, LayoutGrid, Search, ShoppingCart, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useCart } from "@/lib/cart";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/", label: "Home", icon: Home, match: (p: string) => p === "/" },
  { href: "/products", label: "Shop", icon: LayoutGrid, match: (p: string) => p.startsWith("/products") || p.startsWith("/brands") },
  { href: "/search", label: "Search", icon: Search, match: (p: string) => p.startsWith("/search") },
  { href: "/cart", label: "Cart", icon: ShoppingCart, match: (p: string) => p.startsWith("/cart") },
  { href: "/account", label: "Account", icon: UserRound, match: (p: string) => p.startsWith("/account") },
] as const;

/** Pages with their own bottom action or a form to finish: a product page (buy bar), checkout and the quote form. */
const NO_TABS = (p: string) => /^\/products\/[^/]+\/[^/]+/.test(p) || p.startsWith("/checkout") || p.startsWith("/quote");

/**
 * Phone and tablet tab bar (the site installs as a PWA): a floating rounded bar above the home-indicator safe area.
 * The active tab gets a soft green pill behind its icon; the cart tab carries the item count. It slides away while
 * the visitor scrolls down (more room to read) and comes back on the first scroll up. Hidden where a page has its own
 * bottom action (see NO_TABS).
 */
export function BottomBar() {
  const pathname = usePathname() || "/";
  const n = useCart().reduce((s, i) => s + i.qty, 0);
  const [tucked, setTucked] = useState(false);

  // a new page always starts with the bar showing (set during render, React's pattern for state that follows a prop)
  const [seenPath, setSeenPath] = useState(pathname);
  if (seenPath !== pathname) {
    setSeenPath(pathname);
    setTucked(false);
  }

  useEffect(() => {
    let last = window.scrollY;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const y = window.scrollY;
        const d = y - last;
        if (Math.abs(d) < 8) return; // ignore jitter
        setTucked(d > 0 && y > 120);
        last = y;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  if (NO_TABS(pathname)) return null;
  return (
    <nav
      aria-label="App"
      className={cn(
        "fixed inset-x-3 bottom-[calc(0.5rem+env(safe-area-inset-bottom))] z-40 mx-auto max-w-md rounded-2xl bg-white/90 shadow-[0_8px_28px_-8px_rgb(29_35_48/0.28)] ring-1 ring-line backdrop-blur-xl transition-transform duration-300 ease-out lg:hidden",
        tucked && "translate-y-[calc(100%+1rem+env(safe-area-inset-bottom))]",
      )}
    >
      <ul className="grid h-16 grid-cols-5 px-1">
        {TABS.map((t) => {
          const on = t.match(pathname);
          const Icon = t.icon;
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={on ? "page" : undefined}
                className={cn("flex h-full flex-col items-center justify-center gap-0.5 text-[0.625rem] font-medium transition-colors", on ? "text-brand-900" : "text-muted-ink active:text-ink")}
              >
                <span className={cn("relative grid h-7 w-12 place-items-center rounded-full transition-colors duration-200", on && "bg-surface")}>
                  <Icon className="size-5" strokeWidth={on ? 2.25 : 1.75} />
                  {t.href === "/cart" && n > 0 && (
                    <span className="absolute -top-1 right-1.5 grid min-w-4 place-items-center rounded-full bg-brand-900 px-1 text-[0.5625rem] leading-4 font-semibold text-on-brand ring-2 ring-panel">{n}</span>
                  )}
                </span>
                <span className={cn(on && "font-semibold")}>{t.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
