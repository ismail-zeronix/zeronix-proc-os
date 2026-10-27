"use client";

import { BookOpenText, ChevronRight, Compass, Cpu, MapPin, Search, Trophy, X, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { APPS } from "@/lib/apps";

export interface TreeItem {
  slug: string;
  title: string;
  summary: string;
  /** section key */
  section: string;
  /** the article's headings, shown under it when it is open */
  headings: { id: string; text: string }[];
  /** whole article as text, for search */
  text: string;
}

export interface SectionInfo {
  key: string;
  title: string;
  blurb: string;
}

const app = (key: string) => APPS.find((a) => a.key === key)!;

/** Icon and colour of each category: the app guides wear their app's own icon, as on the home screen. */
export const SECTION_LOOK: Record<string, { icon: LucideIcon; color: string }> = {
  portal: { icon: Compass, color: "var(--series-7)" },
  crm: { icon: app("crm").icon, color: app("crm").color },
  sales: { icon: app("sales").icon, color: app("sales").color },
  projects: { icon: app("projects").icon, color: app("projects").color },
  hardware: { icon: Cpu, color: "var(--series-1)" },
  playbook: { icon: Trophy, color: "var(--series-4)" },
  uae: { icon: MapPin, color: "var(--series-5)" },
};

export const lookOf = (key: string) => SECTION_LOOK[key] ?? { icon: BookOpenText, color: "var(--muted-foreground)" };

/**
 * The left side of Knowledge: categories, their articles, and the headings of the open article, as a tree. Typing in
 * the search box keeps only the articles where every word appears, with their categories opened. On phones the tree is
 * the Knowledge home page and steps aside while an article is read.
 */
export function KnowledgeTree({ items, sections }: { items: TreeItem[]; sections: SectionInfo[] }) {
  const pathname = usePathname();
  const slug = pathname.startsWith("/knowledge/") ? decodeURIComponent(pathname.slice("/knowledge/".length)) : "";
  const active = items.find((a) => a.slug === slug);
  const [open, setOpen] = useState<Set<string>>(() => new Set([active?.section ?? "portal"]));
  const [q, setQ] = useState("");
  const [seen, setSeen] = useState(slug);

  // opening another article (from a link, previous / next or search) unfolds its category
  if (seen !== slug) {
    setSeen(slug);
    if (active && !open.has(active.section)) setOpen(new Set(open).add(active.section));
  }

  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = words.length ? items.filter((a) => words.every((w) => `${a.title} ${a.summary} ${a.text}`.toLowerCase().includes(w))) : items;
  const toggle = (key: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });

  return (
    <aside
      className={`${slug ? "hidden lg:flex" : "flex"} min-h-0 flex-col gap-2 lg:sticky lg:top-14 lg:max-h-[calc(100svh-4.5rem)]`}
      aria-label="Knowledge contents"
    >
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search: quote, BOQ, warranty…" className="h-8 pr-8 pl-8" aria-label="Search knowledge" />
        {q && (
          <button type="button" onClick={() => setQ("")} className="absolute top-1/2 right-2 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground hover:text-foreground" aria-label="Clear search">
            <X className="size-3.5" />
          </button>
        )}
      </div>
      {words.length > 0 && (
        <p className="px-1 text-xs text-muted-foreground">
          {shown.length} article{shown.length === 1 ? "" : "s"} for “{q.trim()}”
        </p>
      )}

      <nav className="min-h-0 flex-1 overflow-y-auto rounded-lg border bg-card p-1">
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-0.5">
          {sections.map((s) => {
            const list = shown.filter((a) => a.section === s.key);
            if (words.length && !list.length) return null;
            const expanded = words.length > 0 || open.has(s.key);
            const { icon: Icon, color } = lookOf(s.key);
            return (
              <li key={s.key}>
                <button
                  type="button"
                  onClick={() => toggle(s.key)}
                  aria-expanded={expanded}
                  title={s.blurb}
                  className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1.5 text-left text-sm font-medium hover:bg-muted"
                >
                  <ChevronRight className={`size-3.5 shrink-0 text-muted-foreground transition-transform ${expanded ? "rotate-90" : ""}`} aria-hidden />
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-md" style={{ backgroundColor: `color-mix(in oklab, ${color} 14%, transparent)`, color }}>
                    <Icon className="size-3.5" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1 truncate">{s.title}</span>
                  <span className="rounded-full bg-muted px-1.5 text-[10px] text-muted-foreground tabular-nums">{list.length}</span>
                </button>
                {expanded && (
                  <ul className="ml-[1.1rem] grid grid-cols-[minmax(0,1fr)] gap-0.5 border-l py-0.5 pl-2">
                    {list.map((a) => {
                      const current = a.slug === slug;
                      return (
                        <li key={a.slug}>
                          <Link
                            href={`/knowledge/${a.slug}`}
                            aria-current={current ? "page" : undefined}
                            title={a.summary}
                            className={`block rounded-md px-2 py-1 text-[13px] leading-snug ${current ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                          >
                            {a.title}
                          </Link>
                          {current && !words.length && a.headings.length > 0 && (
                            <ul className="my-0.5 ml-2 grid border-l pl-2">
                              {a.headings.map((h) => (
                                <li key={h.id}>
                                  <a href={`#${h.id}`} className="block truncate rounded-sm px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground" title={h.text}>
                                    {h.text}
                                  </a>
                                </li>
                              ))}
                            </ul>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
          {words.length > 0 && !shown.length && <li className="px-2 py-3 text-sm text-muted-foreground">Nothing found. Try fewer words.</li>}
        </ul>
      </nav>
    </aside>
  );
}
