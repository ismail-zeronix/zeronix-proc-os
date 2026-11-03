"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";

export interface EmirateKeywords {
  emirate: string;
  products: { href: string; label: string }[];
  services: { href: string; label: string }[];
}

/**
 * "Popular searches" inside the footer, on the home page only: one tab per emirate, each a line of product and service
 * searches linking to the real category and service pages. Every tab is in the HTML (the others only hidden), so search
 * engines read them all. Other pages show `children` instead (the footer's plain "we deliver to" line), so the same
 * emirates are never listed twice on one page.
 */
export function KeywordHub({ groups, children }: { groups: EmirateKeywords[]; children?: React.ReactNode }) {
  const home = usePathname() === "/";
  const [active, setActive] = useState(groups[0]?.emirate);
  if (!home || !groups.length) return <>{children}</>;
  return (
    <section aria-labelledby="popular-searches" className="grid gap-3 border-t border-white/10 py-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-6">
        <h2 id="popular-searches" className="shrink-0 font-sans text-xs font-semibold tracking-[0.12em] text-mint-300 uppercase">
          Popular searches
        </h2>
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
                "inline-flex h-7 items-center rounded-full px-3 text-xs font-semibold whitespace-nowrap transition-colors",
                g.emirate === active ? "bg-lime-400 text-forest-950" : "bg-white/[0.06] text-white/70 hover:bg-white/10 hover:text-white",
              )}
            >
              {g.emirate}
            </button>
          ))}
        </div>
      </div>
      {groups.map((g) => (
        <div key={g.emirate} id={`kw-${g.emirate}`} role="tabpanel" aria-labelledby={`kw-tab-${g.emirate}`} hidden={g.emirate !== active}>
          <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs leading-relaxed">
            {[...g.products, ...g.services].map((l) => (
              <li key={l.label}>
                <Link href={l.href} className="text-white/55 transition-colors hover:text-lime-400">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
