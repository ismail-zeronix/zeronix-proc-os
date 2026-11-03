"use client";

import { MapPin } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { cn } from "@/lib/utils";

export interface EmirateKeywords {
  emirate: string;
  products: { href: string; label: string }[];
  services: { href: string; label: string }[];
}

/**
 * "Popular searches" above the footer: one tab per emirate, each a cloud of product and service searches linking to the
 * real category and service pages. Every tab is in the HTML (the others only hidden), so search engines read them all.
 */
export function KeywordHub({ groups }: { groups: EmirateKeywords[] }) {
  const [active, setActive] = useState(groups[0]?.emirate);
  if (!groups.length) return null;
  const pill = "inline-flex h-8 items-center rounded-full border border-line bg-white px-3 text-xs text-ink/80 transition-colors hover:border-forest-900 hover:text-forest-950 sm:text-[0.8125rem]";
  return (
    <section aria-labelledby="popular-searches" className="container-site pt-2 pb-8 sm:pb-10">
      <div className="rounded-frame border border-line/70 bg-sage-50 p-4 sm:p-6">
        <div className="grid gap-3">
          <div>
            <h2 id="popular-searches" className="flex items-center gap-2.5 text-h2 text-ink">
              <span aria-hidden className="h-1 w-6 shrink-0 rounded-full bg-lime-400" />
              Popular searches across the UAE
            </h2>
            <p className="mt-1 text-sm text-muted-ink">IT hardware, delivery and on-site services in all seven emirates.</p>
          </div>
          <div role="tablist" aria-label="Emirates" className="scroll-row sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
            {groups.map((g) => (
              <button
                key={g.emirate}
                type="button"
                role="tab"
                id={`kw-tab-${g.emirate}`}
                aria-selected={g.emirate === active}
                aria-controls={`kw-${g.emirate}`}
                onClick={() => setActive(g.emirate)}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold whitespace-nowrap transition-colors sm:text-sm",
                  g.emirate === active ? "border-forest-900 bg-forest-900 text-white" : "border-line bg-white text-ink hover:border-forest-900",
                )}
              >
                <MapPin className={cn("size-3.5", g.emirate === active ? "text-lime-400" : "text-forest-700")} />
                {g.emirate}
              </button>
            ))}
          </div>
        </div>
        {groups.map((g) => (
          <div key={g.emirate} id={`kw-${g.emirate}`} role="tabpanel" aria-labelledby={`kw-tab-${g.emirate}`} hidden={g.emirate !== active} className="mt-5 grid gap-4 lg:grid-cols-2 lg:gap-8">
            {[
              { title: `IT products in ${g.emirate}`, links: g.products },
              { title: `IT services in ${g.emirate}`, links: g.services },
            ].map((col) => (
              <div key={col.title}>
                <h3 className="mb-2 text-xs font-semibold tracking-[0.12em] text-muted-ink uppercase">{col.title}</h3>
                <ul className="flex flex-wrap gap-1.5">
                  {col.links.map((l) => (
                    <li key={l.label}>
                      <Link href={l.href} className={pill}>
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
