"use client";

import { Check, ClipboardList, ListPlus } from "lucide-react";
import Link from "next/link";
import { quoteList, useQuoteList } from "@/lib/quote-list";
import { cn } from "@/lib/utils";

/** "Add to quote list" on product cards and pages; shows a tick once the product is on the list. */
export function AddToQuote({ slug, name, className, label = false }: { slug: string; name: string; className?: string; label?: boolean }) {
  const on = useQuoteList().some((i) => i.slug === slug);
  return (
    <button
      type="button"
      aria-label={on ? `${name} is on your quote list` : `Add ${name} to the quote list`}
      title={on ? "On your quote list" : "Add to quote list"}
      onClick={() => quoteList.add({ slug, name })}
      data-track="add-to-quote"
      className={cn(
        "inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-full border transition-colors",
        label ? "px-4 text-sm font-semibold" : "w-10",
        on ? "border-forest-900 bg-forest-900 text-lime-400" : "border-line text-forest-900 hover:border-forest-900",
        className,
      )}
    >
      {on ? <Check className="size-4" /> : <ListPlus className="size-4" />}
      {label && (on ? "On your list" : "Add to quote list")}
    </button>
  );
}

/** Header link to /quote with the number of products on the list (hidden while it is empty). */
export function QuoteListLink() {
  const n = useQuoteList().reduce((s, i) => s + i.qty, 0);
  if (!n) return null;
  return (
    <Link href="/quote" aria-label={`Quote list, ${n} item${n === 1 ? "" : "s"}`} className="relative grid size-10 place-items-center rounded-full border border-line bg-white text-forest-900 hover:border-forest-900">
      <ClipboardList className="size-4" />
      <span className="absolute -top-1 -right-1 grid min-w-5 place-items-center rounded-full bg-lime-400 px-1 text-[11px] font-bold text-forest-950">{n}</span>
    </Link>
  );
}
