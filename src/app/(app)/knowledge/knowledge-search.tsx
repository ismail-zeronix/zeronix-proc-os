"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Input } from "@/components/ui/input";

export interface SearchItem {
  slug: string;
  title: string;
  summary: string;
  section: string;
  /** lower-case text of the whole article */
  text: string;
}

/** Search box over every article. Shows matches as you type; empty box shows nothing (the sections below are the index). */
export function KnowledgeSearch({ items }: { items: SearchItem[] }) {
  const [q, setQ] = useState("");
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const hits = words.length
    ? items.filter((a) => words.every((w) => `${a.title} ${a.summary} ${a.text}`.toLowerCase().includes(w)))
    : [];
  return (
    <div className="grid gap-2">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search: warranty, objection, Xeon, RFQ, genuine lead…"
          className="pl-8"
          aria-label="Search knowledge"
        />
      </div>
      {words.length > 0 && (
        <div className="grid gap-1 rounded-lg border p-1">
          {hits.map((a) => (
            <Link key={a.slug} href={`/knowledge/${a.slug}`} className="rounded-md px-3 py-2 hover:bg-muted">
              <div className="text-sm font-medium">{a.title}</div>
              <div className="text-xs text-muted-foreground">
                {a.section} · {a.summary}
              </div>
            </Link>
          ))}
          {!hits.length && <p className="px-3 py-2 text-sm text-muted-foreground">Nothing found for “{q.trim()}”.</p>}
        </div>
      )}
    </div>
  );
}
