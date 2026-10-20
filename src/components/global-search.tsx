"use client";

import { useQuery } from "@tanstack/react-query";
import { LayoutGrid, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { searchPages } from "@/lib/app-nav";
import { appByKey, type AppKey } from "@/lib/apps";
import { money } from "@/lib/format";
import type { ProductHit } from "@/lib/search";

/** Ctrl/⌘+K (or "/") anywhere: jump to a page, or find a product when the user has Procurement. */
export function GlobalSearch({ apps }: { apps: AppKey[] }) {
  const router = useRouter();
  const hasProducts = apps.includes("procurement");
  const pages = [
    { href: "/", label: "Home", icon: LayoutGrid, group: "Zeronix" },
    ...searchPages(apps).map((p) => ({ href: p.href, label: p.label, icon: p.icon, group: appByKey(p.app).label })),
  ];
  const groups = [...new Set(pages.map((p) => p.group))];
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = /^(input|textarea|select)$/i.test((e.target as HTMLElement)?.tagName ?? "") ||
        (e.target as HTMLElement)?.isContentEditable;
      if ((e.key === "k" && (e.ctrlKey || e.metaKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 200);
    return () => clearTimeout(t);
  }, [q]);

  const { data, isFetching } = useQuery<{ products: ProductHit[]; total: number }>({
    queryKey: ["quick-search", debounced],
    queryFn: () => fetch(`/api/search?limit=8&q=${encodeURIComponent(debounced)}`).then((r) => r.json()),
    enabled: open && hasProducts && debounced.length >= 2,
    staleTime: 30_000,
  });
  const needle = q.trim().toLowerCase();
  const shownPages = needle ? pages.filter((p) => `${p.group} ${p.label}`.toLowerCase().includes(needle)) : pages;

  const go = (href: string) => {
    setOpen(false);
    setQ("");
    router.push(href);
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="w-full max-w-xs justify-start text-muted-foreground sm:w-64"
        onClick={() => setOpen(true)}
      >
        <Search />
        <span className="flex-1 text-left">{hasProducts ? "Find a product or page…" : "Go to a page…"}</span>
        <kbd className="hidden rounded border bg-muted px-1.5 text-[10px] font-medium sm:inline">Ctrl K</kbd>
      </Button>
      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Find a product or page"
        description={hasProducts ? "Type a model, part number or spec" : "Type a page name"}
      >
        <Command shouldFilter={false}>
          <CommandInput
            value={q}
            onValueChange={setQ}
            placeholder={hasProducts ? "Model, part number or spec…" : "Page name…"}
          />
          <CommandList>
            {hasProducts && debounced.length >= 2 ? (
              <>
                {data?.products.length ? (
                  <CommandGroup heading={`Products${data.total > data.products.length ? ` (${data.total} found)` : ""}`}>
                    {data.products.map((p) => (
                      <CommandItem key={p.id} value={`p${p.id}`} onSelect={() => go(`/procurement/products/${p.id}`)}>
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">{p.label}</div>
                          <div className="truncate text-xs text-muted-foreground">{p.specSummary}</div>
                        </div>
                        <div className="text-right text-xs whitespace-nowrap">
                          <div className="font-medium tabular-nums">
                            {p.bestPrice != null ? money(p.bestPrice, p.bestCurrency ?? "AED") : "On request"}
                          </div>
                          <div className="text-muted-foreground">
                            {new Set(p.offers.map((o) => o.supplierId)).size} supplier(s)
                          </div>
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ) : (
                  !isFetching && <CommandEmpty>No product matches “{debounced}”.</CommandEmpty>
                )}
                <CommandGroup heading="Search">
                  <CommandItem value="all" onSelect={() => go(`/procurement/compare?q=${encodeURIComponent(debounced)}`)}>
                    <Search /> See all results for “{debounced}” on the Compare page
                  </CommandItem>
                </CommandGroup>
              </>
            ) : shownPages.length ? (
              groups.map((g) => {
                const items = shownPages.filter((p) => p.group === g);
                return items.length ? (
                  <CommandGroup key={g} heading={g === "Zeronix" ? "Go to" : g}>
                    {items.map((p) => (
                      <CommandItem key={p.href} value={p.href} onSelect={() => go(p.href)}>
                        <p.icon /> {p.label}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ) : null;
              })
            ) : (
              <CommandEmpty>No page matches “{q.trim()}”.</CommandEmpty>
            )}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
