"use client";

import { useQuery } from "@tanstack/react-query";
import { Bell, ClipboardPaste, History, LayoutDashboard, Search, Truck } from "lucide-react";
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
import { money } from "@/lib/format";
import type { ProductHit } from "@/lib/search";

const PAGES = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/compare", label: "Compare prices", icon: Search },
  { href: "/import", label: "Paste a price list", icon: ClipboardPaste },
  { href: "/alerts", label: "Price alerts", icon: Bell },
  { href: "/price-lists", label: "Price lists", icon: History },
  { href: "/suppliers", label: "Suppliers", icon: Truck },
];

/** Ctrl/⌘+K (or "/") anywhere: jump straight to a product or a page. */
export function GlobalSearch() {
  const router = useRouter();
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
    enabled: open && debounced.length >= 2,
    staleTime: 30_000,
  });

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
        <span className="flex-1 text-left">Find a product…</span>
        <kbd className="hidden rounded border bg-muted px-1.5 text-[10px] font-medium sm:inline">Ctrl K</kbd>
      </Button>
      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Find a product or page"
        description="Type a model, part number or spec"
      >
        <Command shouldFilter={false}>
          <CommandInput value={q} onValueChange={setQ} placeholder="Model, part number or spec…" />
          <CommandList>
            {debounced.length >= 2 ? (
              <>
                {data?.products.length ? (
                  <CommandGroup heading={`Products${data.total > data.products.length ? ` (${data.total} found)` : ""}`}>
                    {data.products.map((p) => (
                      <CommandItem key={p.id} value={`p${p.id}`} onSelect={() => go(`/products/${p.id}`)}>
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
                  <CommandItem value="all" onSelect={() => go(`/compare?q=${encodeURIComponent(debounced)}`)}>
                    <Search /> See all results for “{debounced}” on the Compare page
                  </CommandItem>
                </CommandGroup>
              </>
            ) : (
              <CommandGroup heading="Go to">
                {PAGES.map((p) => (
                  <CommandItem key={p.href} value={p.href} onSelect={() => go(p.href)}>
                    <p.icon /> {p.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
