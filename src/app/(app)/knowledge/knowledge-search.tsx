"use client";

import { Compass, Cpu, Handshake, MapPin, Search, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { PageToolbar } from "@/components/page-toolbar";
import { Input } from "@/components/ui/input";

export interface SearchItem {
  slug: string;
  title: string;
  summary: string;
  section: string;
  /** whole article as text, for search */
  text: string;
}

export interface SectionInfo {
  key: string;
  title: string;
  blurb: string;
}

const ICONS: Record<string, LucideIcon> = { portal: Compass, hardware: Cpu, sales: Handshake, uae: MapPin };

/**
 * The Knowledge index: sections side by side as compact lists. Typing in the search box swaps them for the matching
 * articles (every word must appear somewhere in the article).
 */
export function KnowledgeIndex({ items, sections }: { items: SearchItem[]; sections: SectionInfo[] }) {
  const [q, setQ] = useState("");
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const hits = words.length ? items.filter((a) => words.every((w) => `${a.title} ${a.summary} ${a.text}`.toLowerCase().includes(w))) : [];

  return (
    <div className="grid gap-3">
      <PageToolbar title="Knowledge" meta={`${items.length} articles · hardware, sales and finding customers`}>
        <div className="relative w-72 max-w-full">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search: warranty, Xeon, RFQ, genuine lead…"
            className="h-8 pl-8"
            aria-label="Search knowledge"
          />
        </div>
      </PageToolbar>

      {words.length > 0 ? (
        <div className="rounded-lg border bg-card p-1">
          <p className="px-2.5 py-1 text-xs text-muted-foreground">
            {hits.length} article{hits.length === 1 ? "" : "s"} for “{q.trim()}”
          </p>
          {hits.map((a) => (
            <Link key={a.slug} href={`/knowledge/${a.slug}`} className="block rounded-md px-2.5 py-1.5 hover:bg-muted">
              <div className="text-sm font-medium">{a.title}</div>
              <div className="truncate text-xs text-muted-foreground">
                {a.section} · {a.summary}
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="grid items-start gap-3 md:grid-cols-2">
          {sections.map((s) => {
            const Icon = ICONS[s.key] ?? Search;
            const list = items.filter((a) => a.section === s.title);
            return (
              <section key={s.key} className="rounded-lg border bg-card" aria-label={s.title}>
                <header className="flex items-start gap-2.5 border-b px-3 py-2.5">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <Icon className="size-4" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold">{s.title}</h2>
                    <p className="text-xs text-muted-foreground">{s.blurb}</p>
                  </div>
                </header>
                <ul className="p-1">
                  {list.map((a) => (
                    <li key={a.slug}>
                      <Link href={`/knowledge/${a.slug}`} className="block rounded-md px-2.5 py-1.5 hover:bg-muted" title={a.summary}>
                        <div className="text-sm font-medium">{a.title}</div>
                        <div className="line-clamp-1 text-xs text-muted-foreground">{a.summary}</div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
