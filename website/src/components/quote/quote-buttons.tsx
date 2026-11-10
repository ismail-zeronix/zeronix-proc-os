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
        on ? "border-brand-900 bg-brand-900 text-cta" : "border-line text-brand-900 hover:border-brand-900",
        className,
      )}
    >
      {on ? <Check className="size-4" /> : <ListPlus className="size-4" />}
      {label && (on ? "On your list" : "Add to quote list")}
    </button>
  );
}

/** Header link to /quote with the number of products on the list (hidden while it is empty). */
/** The quote list in the header, always there like a cart; the count shows once something is on it. */
export function QuoteListLink({ withLabel = false }: { withLabel?: boolean }) {
  const n = useQuoteList().reduce((s, i) => s + i.qty, 0);
  return (
    <Link href="/quote" aria-label={n ? `Quote list, ${n} item${n === 1 ? "" : "s"}` : "Quote list"} className="relative inline-flex h-10 items-center gap-2 rounded-full px-2.5 text-brand-900 transition-colors hover:bg-surface">
      <span className="relative">
        <ClipboardList className="size-5" />
        {n > 0 && <span className="absolute -top-2 -right-2.5 grid min-w-4.5 place-items-center rounded-full bg-cta px-1 text-[10px] leading-[1.125rem] font-bold text-brand-950">{n}</span>}
      </span>
      {withLabel && <span className="hidden text-sm font-semibold xl:inline">Quote list</span>}
    </Link>
  );
}
