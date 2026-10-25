"use client";

import { useQuery } from "@tanstack/react-query";
import { Building2, FileText, Handshake, LayoutGrid, MessageCircle, Search, User } from "lucide-react";
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
import { orderStatusLabel } from "@/lib/invoicing";
import { quoteStatusLabel } from "@/lib/quotation";
import { stageLabel } from "@/lib/sales";
import type { ProductHit } from "@/lib/search";

interface SalesHits {
  companies: { id: number; name: string; emirate: string; industry: string }[];
  contacts: { id: number; name: string; email: string; companyId: number; companyName: string }[];
  deals: { id: number; title: string; stage: string; companyName: string }[];
  quotes: { id: number; number: string; status: string; total: number; companyName: string }[];
  orders?: { id: number; number: string; status: string; total: number; companyName: string }[];
  invoices?: { id: number; number: string; status: string; total: number; companyName: string; href: string }[];
}

/** Ctrl/⌘+K (or "/") anywhere: jump to a page, a product (Procurement), or a company, person or deal (Sales). */
export function GlobalSearch({ apps }: { apps: AppKey[] }) {
  const router = useRouter();
  const hasProducts = apps.includes("procurement");
  const hasSales = apps.includes("sales");
  const pages = [
    { href: "/", label: "Home", icon: LayoutGrid, group: "Zeronix" },
    { href: "/chat", label: "Chat", icon: MessageCircle, group: "Zeronix" },
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

  const searching = debounced.length >= 2 && (hasProducts || hasSales);
  const products = useQuery<{ products: ProductHit[]; total: number }>({
    queryKey: ["quick-search", debounced],
    queryFn: () => fetch(`/api/search?limit=8&q=${encodeURIComponent(debounced)}`).then((r) => r.json()),
    enabled: open && hasProducts && debounced.length >= 2,
    staleTime: 30_000,
  });
  const sales = useQuery<SalesHits>({
    queryKey: ["quick-search-sales", debounced],
    queryFn: () => fetch(`/api/sales/search?kind=all&q=${encodeURIComponent(debounced)}`).then((r) => r.json()),
    enabled: open && hasSales && debounced.length >= 2,
    staleTime: 30_000,
  });
  const fetching = products.isFetching || sales.isFetching;
  const nothing = !products.data?.products.length && !sales.data?.companies.length && !sales.data?.contacts.length && !sales.data?.deals.length && !sales.data?.quotes?.length && !sales.data?.orders?.length && !sales.data?.invoices?.length;
  const needle = q.trim().toLowerCase();
  const shownPages = needle ? pages.filter((p) => `${p.group} ${p.label}`.toLowerCase().includes(needle)) : pages;

  const go = (href: string) => {
    setOpen(false);
    setQ("");
    router.push(href);
  };

  const what = [hasProducts && "product", hasSales && "company, person, deal or quote"].filter(Boolean).join(", ");
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="w-8 justify-center px-0 text-muted-foreground sm:w-64 sm:justify-start sm:px-2.5"
        aria-label="Search or go to a page"
        title="Search (Ctrl K)"
        onClick={() => setOpen(true)}
      >
        <Search />
        <span className="hidden flex-1 text-left sm:inline">{what ? "Search or go to a page…" : "Go to a page…"}</span>
        <kbd className="hidden rounded border bg-muted px-1.5 text-[10px] font-medium sm:inline">Ctrl K</kbd>
      </Button>
      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Search"
        description={what ? `Find a ${what}, or a page` : "Type a page name"}
      >
        <Command shouldFilter={false}>
          <CommandInput
            value={q}
            onValueChange={setQ}
            placeholder={hasProducts && hasSales ? "Model, company, person, deal…" : hasProducts ? "Model, part number or spec…" : hasSales ? "Company, person or deal…" : "Page name…"}
          />
          <CommandList>
            {searching ? (
              <>
                {sales.data?.deals.length ? (
                  <CommandGroup heading="Deals">
                    {sales.data.deals.map((d) => (
                      <CommandItem key={`d${d.id}`} value={`d${d.id}`} onSelect={() => go(`/sales/deals/${d.id}`)}>
                        <Handshake />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">{d.title}</div>
                          <div className="truncate text-xs text-muted-foreground">
                            {d.companyName} · {stageLabel(d.stage)}
                          </div>
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ) : null}
                {sales.data?.quotes?.length ? (
                  <CommandGroup heading="Quotes">
                    {sales.data.quotes.map((x) => (
                      <CommandItem key={`q${x.id}`} value={`q${x.id}`} onSelect={() => go(`/sales/quotes/${x.id}`)}>
                        <FileText />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">{x.number}</div>
                          <div className="truncate text-xs text-muted-foreground">
                            {x.companyName} · {quoteStatusLabel(x.status)}
                          </div>
                        </div>
                        <span className="ml-auto text-xs text-muted-foreground">{money(x.total)}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ) : null}
                {sales.data?.orders?.length ? (
                  <CommandGroup heading="Orders">
                    {sales.data.orders.map((x) => (
                      <CommandItem key={`o${x.id}`} value={`o${x.id}`} onSelect={() => go(`/sales/orders/${x.id}`)}>
                        <FileText />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">{x.number}</div>
                          <div className="truncate text-xs text-muted-foreground">
                            {x.companyName} · {orderStatusLabel(x.status)}
                          </div>
                        </div>
                        <span className="ml-auto text-xs text-muted-foreground">{money(x.total)}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ) : null}
                {sales.data?.invoices?.length ? (
                  <CommandGroup heading="Invoices">
                    {sales.data.invoices.map((x) => (
                      <CommandItem key={`i${x.id}`} value={`i${x.id}`} onSelect={() => go(x.href)}>
                        <FileText />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">{x.number}</div>
                          <div className="truncate text-xs text-muted-foreground">
                            {x.companyName}
                            {x.status === "cancelled" ? " · cancelled" : ""}
                          </div>
                        </div>
                        <span className="ml-auto text-xs text-muted-foreground">{money(x.total)}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ) : null}
                {sales.data?.companies.length ? (
                  <CommandGroup heading="Companies">
                    {sales.data.companies.map((c) => (
                      <CommandItem key={`c${c.id}`} value={`c${c.id}`} onSelect={() => go(`/sales/companies/${c.id}`)}>
                        <Building2 /> {c.name}
                        <span className="ml-auto text-xs text-muted-foreground">{[c.emirate, c.industry].filter(Boolean).join(" · ")}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ) : null}
                {sales.data?.contacts.length ? (
                  <CommandGroup heading="People">
                    {sales.data.contacts.map((p) => (
                      <CommandItem key={`p${p.id}`} value={`person${p.id}`} onSelect={() => go(`/sales/companies/${p.companyId}`)}>
                        <User /> {p.name}
                        <span className="ml-auto truncate text-xs text-muted-foreground">{p.companyName}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ) : null}
                {products.data?.products.length ? (
                  <CommandGroup heading={`Products${products.data.total > products.data.products.length ? ` (${products.data.total} found)` : ""}`}>
                    {products.data.products.map((p) => (
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
                ) : null}
                {!fetching && nothing && <CommandEmpty>Nothing matches “{debounced}”.</CommandEmpty>}
                {hasProducts && (
                  <CommandGroup heading="Search">
                    <CommandItem value="all" onSelect={() => go(`/procurement/compare?q=${encodeURIComponent(debounced)}`)}>
                      <Search /> See all products for “{debounced}” on the Compare page
                    </CommandItem>
                  </CommandGroup>
                )}
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
