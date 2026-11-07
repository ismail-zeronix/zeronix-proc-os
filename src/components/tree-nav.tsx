"use client";

import { Collapsible } from "@base-ui/react/collapsible";
import { ChevronDown, ChevronRight, Folder, FolderOpen, Search, Star } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

export interface TreeItem {
  key: string;
  label: string;
  hint?: string;
  href: string;
}

export interface TreeFolder {
  label: string;
  items: TreeItem[];
}

/** Reads a saved list from this browser. A convenience: the page works the same without it. */
function loadList(key: string): string[] | null {
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? "null");
    return Array.isArray(saved) ? saved.filter((s) => typeof s === "string") : null;
  } catch {
    return null;
  }
}
function saveList(key: string, list: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
    /* no storage in this browser */
  }
}

/**
 * Pages grouped in folders that open and close. The folder of the current page opens by itself, open folders are
 * remembered in this browser, and searching opens whatever matches. On phones the whole tree folds behind the current
 * page's name. `search` and `stars` turn on a find box and "keep at the top" stars.
 */
export function TreeNav({ label, folders, current, storageKey, search, stars: withStars = false }: { label: string; folders: TreeFolder[]; current: string; storageKey: string; /** Placeholder of the find box. */ search?: string; stars?: boolean }) {
  const openKey = `zx-tree-open-${storageKey}`;
  const starKey = `zx-tree-stars-${storageKey}`;
  const [q, setQ] = useState("");
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [opened, setOpened] = useState<string[]>([]);
  const [stars, setStars] = useState<string[]>([]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- browser storage can only be read after the first render */
    setOpened(loadList(openKey) ?? []);
    if (withStars) setStars(loadList(starKey) ?? []);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [openKey, starKey, withStars]);

  const setFolder = (name: string, on: boolean) => {
    const next = on ? [...new Set([...opened, name])] : opened.filter((f) => f !== name);
    setOpened(next);
    saveList(openKey, next);
  };
  const toggleStar = (key: string) => {
    const next = stars.includes(key) ? stars.filter((s) => s !== key) : [...stars, key];
    setStars(next);
    saveList(starKey, next);
  };

  const all = folders.flatMap((f) => f.items);
  const needle = q.trim().toLowerCase();
  const match = (i: TreeItem) => !needle || i.label.toLowerCase().includes(needle) || (i.hint ?? "").toLowerCase().includes(needle);
  const starred = all.filter((i) => stars.includes(i.key) && match(i));
  const shown = folders.map((f) => ({ ...f, items: f.items.filter(match) })).filter((f) => f.items.length);
  const name = all.find((i) => i.key === current)?.label ?? label;

  const leaf = (i: TreeItem) => (
    <li key={i.key} className="group flex items-center gap-0.5">
      <Link
        href={i.href}
        title={i.hint}
        aria-current={i.key === current ? "page" : undefined}
        onClick={() => setPhoneOpen(false)}
        className={`min-w-0 flex-1 truncate rounded-md px-2 py-1 text-xs ${i.key === current ? "bg-primary font-medium text-primary-foreground" : "text-foreground hover:bg-muted"}`}
      >
        {i.label}
      </Link>
      {withStars && (
        <button
          type="button"
          onClick={() => toggleStar(i.key)}
          aria-label={`${stars.includes(i.key) ? "Remove the star from" : "Star"} ${i.label}`}
          aria-pressed={stars.includes(i.key)}
          title={stars.includes(i.key) ? "Remove the star" : "Keep at the top"}
          className={`shrink-0 rounded p-1 text-muted-foreground hover:text-foreground ${stars.includes(i.key) ? "" : "md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"}`}
        >
          <Star className={`size-3 ${stars.includes(i.key) ? "fill-current text-amber-500" : ""}`} />
        </button>
      )}
    </li>
  );

  return (
    <nav aria-label={label} className="min-w-0 rounded-xl border bg-card md:sticky md:top-[calc(var(--header-h)+0.75rem)] md:max-h-[calc(100svh-var(--header-h)-2rem)] md:overflow-y-auto">
      <button type="button" onClick={() => setPhoneOpen(!phoneOpen)} aria-expanded={phoneOpen} className="flex min-h-11 w-full items-center justify-between gap-2 px-3 text-sm font-medium md:hidden">
        {name}
        <ChevronDown className={`size-4 transition-transform ${phoneOpen ? "rotate-180" : ""}`} />
      </button>
      <div className={`${phoneOpen ? "block" : "hidden"} p-2 md:block`}>
        {search && (
          <label className="mb-2 flex items-center gap-1.5 rounded-md border px-2">
            <Search className="size-3.5 shrink-0 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={search} aria-label={search} className="h-7 w-full min-w-0 bg-transparent text-base outline-none md:text-xs" />
          </label>
        )}
        {starred.length > 0 && (
          <div className="mb-1 border-b pb-1">
            <div className="flex items-center gap-1.5 px-1 py-1 text-xs font-medium">
              <Star className="size-3.5 fill-current text-amber-500" /> Starred
            </div>
            <ul className="ml-[0.7rem] border-l pl-1.5">{starred.map(leaf)}</ul>
          </div>
        )}
        {shown.map((f) => {
          // searching shows every match; otherwise the current page's folder is always open
          const hasCurrent = f.items.some((i) => i.key === current);
          const isOpen = !!needle || hasCurrent || opened.includes(f.label);
          return (
            <Collapsible.Root key={f.label} open={isOpen} onOpenChange={(o) => setFolder(f.label, o)}>
              <Collapsible.Trigger
                disabled={!!needle || hasCurrent}
                title={hasCurrent ? "The folder of the page you are on stays open" : undefined}
                className="flex w-full items-center gap-1.5 rounded-md px-1 py-1 text-left text-xs font-medium hover:bg-muted disabled:hover:bg-transparent"
              >
                <ChevronRight className={`size-3 shrink-0 text-muted-foreground transition-transform ${isOpen ? "rotate-90" : ""}`} />
                {isOpen ? <FolderOpen className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400" /> : <Folder className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />}
                <span className="min-w-0 flex-1 truncate">{f.label}</span>
                <span className="text-[10px] font-normal text-muted-foreground tabular-nums">{f.items.length}</span>
              </Collapsible.Trigger>
              <Collapsible.Panel>
                <ul className="ml-[0.7rem] border-l pl-1.5">{f.items.map(leaf)}</ul>
              </Collapsible.Panel>
            </Collapsible.Root>
          );
        })}
        {!shown.length && <p className="px-2 py-3 text-center text-xs text-muted-foreground">Nothing by that name.</p>}
      </div>
    </nav>
  );
}
