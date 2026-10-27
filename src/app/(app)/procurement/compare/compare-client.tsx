"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { BadgeCheck, ClipboardPaste, Download, ExternalLink, History, ListFilter, PackageCheck, Search, Trophy, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CopyButton } from "@/components/copy-button";
import { SupplierTypeBadge } from "@/components/supplier-type-badge";
import { Trend } from "@/components/trend";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { quoteText } from "@/lib/export";
import { ago, money } from "@/lib/format";
import type { ProductHit } from "@/lib/search";
import { SUPPLIER_TYPES } from "@/lib/supplier-types";
import { cn } from "@/lib/utils";

interface Meta {
  suppliers: { id: number; name: string; type: string }[];
  /** Supplier categories that have at least one supplier. */
  types: string[];
  brands: string[];
  categories: string[];
  rams: number[];
  stats: { offers: number; products: number; suppliers: number; last: string | null };
}

const FILTERS = ["q", "category", "brand", "supplier", "ram", "days", "priced", "history", "sort", "type", "ready"] as const;
/** Filters that live inside the Filters popover (the others have their own control on the toolbar). */
const POPOVER = ["category", "brand", "type", "supplier", "ram", "days"] as const;

const DAYS = [
  ["3", "Last 3 days"],
  ["7", "Last 7 days"],
  ["14", "Last 14 days"],
  ["30", "Last 30 days"],
  ["90", "Last 90 days"],
] as const;

export function CompareClient() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");
  // set when "Clear all" empties the box itself, so the typing effect below does not write the old filters back
  const clearing = useRef(false);

  // debounce typing into the URL (the URL is the state, so a search can be shared as a link)
  useEffect(() => {
    if (clearing.current) {
      clearing.current = false;
      return;
    }
    const t = setTimeout(() => {
      if ((sp.get("q") ?? "") !== q) setParam("q", q);
    }, 300);
    return () => clearTimeout(t);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  function setParam(key: (typeof FILTERS)[number], value: string) {
    const next = new URLSearchParams(sp.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  const qs = new URLSearchParams();
  for (const f of FILTERS) {
    const v = sp.get(f);
    if (v) qs.set(f, v);
  }

  const meta = useQuery<Meta>({ queryKey: ["meta"], queryFn: () => fetch("/api/meta").then((r) => r.json()) });
  const results = useQuery<{ products: ProductHit[]; total: number; fuzzy: boolean; staleDays: number }>({
    queryKey: ["search", qs.toString()],
    queryFn: () => fetch(`/api/search?${qs.toString()}`).then((r) => r.json()),
    placeholderData: keepPreviousData,
  });

  const empty = meta.data && meta.data.stats.offers === 0;
  const clearAll = () => {
    if (q) clearing.current = true;
    setQ("");
    router.replace(pathname);
  };

  // what each active popover filter is called, for the chips under the toolbar
  const chipText = (k: (typeof POPOVER)[number], v: string) => {
    const m = meta.data;
    if (k === "supplier") return m?.suppliers.find((s) => String(s.id) === v)?.name ?? `Supplier ${v}`;
    if (k === "type") return SUPPLIER_TYPES.find((t) => t.key === v)?.label ?? v;
    if (k === "ram") return `${v} GB`;
    if (k === "days") return DAYS.find(([d]) => d === v)?.[1] ?? `${v} days`;
    return v;
  };
  const activeChips = POPOVER.flatMap((k) => (sp.get(k) ? [{ k, v: sp.get(k)! }] : []));

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder='Model, part number or spec: "FM0013DX", "probook 440", "i5 13420h 16gb"'
            aria-label="Search products"
            className="h-9 pl-8"
          />
        </div>

        <NativeSelect size="sm" aria-label="Sort" value={sp.get("sort") ?? ""} onChange={(e) => setParam("sort", e.target.value)} className="w-auto">
          <NativeSelectOption value="">Most suppliers first</NativeSelectOption>
          <NativeSelectOption value="price">Cheapest first</NativeSelectOption>
          <NativeSelectOption value="spread">Biggest saving first</NativeSelectOption>
          <NativeSelectOption value="recent">Newest first</NativeSelectOption>
        </NativeSelect>

        <Popover>
          <PopoverTrigger render={<Button variant="outline" size="sm" aria-label="Filters" />}>
            <ListFilter /> Filters
            {activeChips.length > 0 && <span className="rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">{activeChips.length}</span>}
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[min(92vw,26rem)] gap-3 p-3">
            <div className="grid grid-cols-2 gap-3">
              <FilterField label="Category" value={sp.get("category") ?? ""} onChange={(v) => setParam("category", v)} any="All">
                {meta.data?.categories.map((c) => <NativeSelectOption key={c} value={c}>{c}</NativeSelectOption>)}
              </FilterField>
              <FilterField label="Brand" value={sp.get("brand") ?? ""} onChange={(v) => setParam("brand", v)} any="All">
                {meta.data?.brands.map((b) => <NativeSelectOption key={b} value={b}>{b}</NativeSelectOption>)}
              </FilterField>
              <FilterField label="Supplier type" value={sp.get("type") ?? ""} onChange={(v) => setParam("type", v)} any="All">
                {SUPPLIER_TYPES.filter((t) => meta.data?.types.includes(t.key)).map((t) => (
                  <NativeSelectOption key={t.key} value={t.key}>{t.label}</NativeSelectOption>
                ))}
              </FilterField>
              <FilterField label="Supplier" value={sp.get("supplier") ?? ""} onChange={(v) => setParam("supplier", v)} any="All">
                {meta.data?.suppliers.map((s) => <NativeSelectOption key={s.id} value={String(s.id)}>{s.name}</NativeSelectOption>)}
              </FilterField>
              <FilterField label="RAM" value={sp.get("ram") ?? ""} onChange={(v) => setParam("ram", v)} any="Any">
                {meta.data?.rams.map((r) => <NativeSelectOption key={r} value={String(r)}>{r} GB</NativeSelectOption>)}
              </FilterField>
              <FilterField label="Quoted" value={sp.get("days") ?? ""} onChange={(v) => setParam("days", v)} any="Any date">
                {DAYS.map(([d, l]) => <NativeSelectOption key={d} value={d}>{l}</NativeSelectOption>)}
              </FilterField>
            </div>
          </PopoverContent>
        </Popover>

        <Toggle on={sp.get("priced") === "1"} onChange={(v) => setParam("priced", v ? "1" : "")} icon={<BadgeCheck />} label="Priced" title="Only offers that have a price" />
        <Toggle on={sp.get("ready") === "1"} onChange={(v) => setParam("ready", v ? "1" : "")} icon={<PackageCheck />} label="In stock" title="Hide offers that are on order or out of stock" />
        <Toggle on={sp.get("history") === "1"} onChange={(v) => setParam("history", v ? "1" : "")} icon={<History />} label="Older" title="Include older offers" />

        <Button
          variant="outline"
          size="icon-sm"
          nativeButton={false}
          render={<a href={`/api/export?${qs.toString()}`} download />}
          disabled={!results.data?.total}
          aria-label="Export CSV"
          title="Export CSV"
        >
          <Download />
        </Button>
        <Button variant="outline" size="icon-sm" nativeButton={false} render={<Link href="/procurement/import" />} aria-label="Paste a price list" title="Paste a price list">
          <ClipboardPaste />
        </Button>
      </div>

      <div className="flex min-h-5 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        {activeChips.map(({ k, v }) => (
          <button
            key={k}
            type="button"
            onClick={() => setParam(k, "")}
            className="inline-flex items-center gap-1 rounded-full border bg-muted/50 py-0.5 pr-1.5 pl-2 text-foreground hover:bg-muted"
            title="Remove this filter"
          >
            {chipText(k, v)} <X className="size-3" />
          </button>
        ))}
        {qs.toString() && (
          <button type="button" className="underline hover:text-foreground" onClick={clearAll}>
            Clear all
          </button>
        )}
        <span className="ml-auto">
          {results.data ? (
            <>
              {results.data.total} product{results.data.total === 1 ? "" : "s"}
              {results.data.total > results.data.products.length ? `, first ${results.data.products.length} shown` : ""}
              {results.data.fuzzy ? ", no exact match so similar ones are shown" : ""}
              {meta.data ? ` · of ${meta.data.stats.products} (${meta.data.stats.offers} offers, ${meta.data.stats.suppliers} suppliers${meta.data.stats.last ? `, last list ${ago(meta.data.stats.last)}` : ""})` : ""}
            </>
          ) : null}
        </span>
      </div>

      {empty ? (
        <div className="rounded-xl border bg-card py-12 text-center">
          <p className="font-medium">No prices yet</p>
          <p className="mb-4 text-sm text-muted-foreground">Paste a supplier WhatsApp price list to get started.</p>
          <Button nativeButton={false} render={<Link href="/procurement/import" />}>
            <ClipboardPaste /> Paste price list
          </Button>
        </div>
      ) : results.isLoading ? (
        <div className="grid gap-2 rounded-xl border bg-card p-3">
          {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-9 w-full" />)}
        </div>
      ) : results.data && !results.data.products.length ? (
        <div className="rounded-xl border bg-card py-10 text-center">
          <p className="font-medium">Nothing matches{q.trim() ? ` “${q.trim()}”` : " these filters"}</p>
          <p className="mb-3 text-sm text-muted-foreground">Try fewer words, a part number, or switch on “Older”.</p>
          <Button variant="outline" onClick={clearAll}>
            Clear search and filters
          </Button>
        </div>
      ) : (
        <ResultsTable products={results.data?.products ?? []} staleDays={results.data?.staleDays ?? 14} fetching={results.isFetching} />
      )}
    </div>
  );
}

function FilterField({ label, value, onChange, any, children }: { label: string; value: string; onChange: (v: string) => void; any: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <NativeSelect size="sm" value={value} onChange={(e) => onChange(e.target.value)} className="w-full">
        <NativeSelectOption value="">{any}</NativeSelectOption>
        {children}
      </NativeSelect>
    </div>
  );
}

/** A small on/off pill for the filters that are yes/no questions. */
function Toggle({ on, onChange, icon, label, title }: { on: boolean; onChange: (v: boolean) => void; icon: React.ReactNode; label: string; title: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      title={title}
      onClick={() => onChange(!on)}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors [&_svg]:size-3.5",
        on ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

/**
 * Every product in ONE table: a sticky header once, then for each product a heading row with its best price
 * followed by one row per supplier offer. The table scrolls inside its panel, so the page itself does not.
 */
function ResultsTable({ products, staleDays, fetching }: { products: ProductHit[]; staleDays: number; fetching: boolean }) {
  return (
    <div className={cn("max-h-[calc(100svh-9.5rem)] overflow-auto rounded-xl border bg-card transition-opacity", fetching && "opacity-70")}>
      <table className="w-full table-fixed text-sm sm:table-auto">
        <thead className="sticky top-0 z-10 bg-card text-xs text-muted-foreground shadow-[0_1px_0_var(--border)]">
          <tr>
            <th className="px-3 py-1.5 text-left font-medium">Supplier</th>
            <th className="w-32 px-3 py-1.5 text-right font-medium sm:w-auto">Price</th>
            <th className="hidden px-3 py-1.5 text-right font-medium sm:table-cell">vs best</th>
            <th className="hidden px-3 py-1.5 text-left font-medium md:table-cell">Spec as quoted</th>
            <th className="hidden px-3 py-1.5 text-left font-medium sm:table-cell">Stock / notes</th>
            <th className="hidden px-3 py-1.5 text-right font-medium sm:table-cell">Received</th>
          </tr>
        </thead>
        {products.map((p) => (
          <ProductGroup key={p.id} p={p} staleDays={staleDays} />
        ))}
      </table>
    </div>
  );
}

function ProductGroup({ p, staleDays }: { p: ProductHit; staleDays: number }) {
  const suppliers = new Set(p.offers.map((o) => o.supplierId)).size;
  const saving = p.bestPrice != null && p.worstPrice != null ? p.worstPrice - p.bestPrice : 0;
  return (
    <tbody className="border-b last:border-b-0">
      {/* the product heading: one wide row on a laptop, a two-column row on a phone (only two columns show there) */}
      <tr className="hidden bg-muted/50 sm:table-row">
        <td colSpan={6} className="px-3 py-1.5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <div className="min-w-0 flex-1">
              <ProductTitle p={p} suppliers={suppliers} />
            </div>
            <BestPrice p={p} saving={saving} staleDays={staleDays} />
          </div>
        </td>
      </tr>
      <tr className="bg-muted/50 sm:hidden">
        <td colSpan={2} className="px-3 py-1.5">
          <ProductTitle p={p} suppliers={suppliers} />
          <div className="mt-1">
            <BestPrice p={p} saving={saving} staleDays={staleDays} align="start" />
          </div>
        </td>
      </tr>
      {p.offers.map((o) => {
        const isBest = o.id === p.bestOfferId && !o.stale;
        // the gap to the best price is always in AED, so a USD sheet and an AED list compare fairly
        const diff = o.priceAed != null && p.bestPrice != null && p.bestCurrency === "AED" ? Math.round(o.priceAed - p.bestPrice) : null;
        return (
          <tr key={o.id} className={cn("border-t hover:bg-muted/30", o.stale && "text-muted-foreground", isBest && "bg-emerald-500/5")}>
            <td className="max-w-[58vw] px-3 py-1 font-medium sm:max-w-none">
              <Link href={`/procurement/suppliers/${o.supplierId}`} className="hover:underline">
                {o.supplierName}
              </Link>
              <SupplierTypeBadge type={o.supplierType} short className="ml-2 align-middle" />
              <span className="block text-xs font-normal text-muted-foreground sm:hidden">
                {ago(o.receivedAt)}
                {o.stale ? " · old" : ""}
                {o.stockNote ? ` · ${o.stockNote}` : ""}
              </span>
            </td>
            <td className="px-3 py-1 text-right tabular-nums">
              {o.price == null ? (
                <span className="text-xs text-muted-foreground italic">Price on request</span>
              ) : (
                <div className="grid justify-items-end">
                  <span className="inline-flex items-center justify-end gap-2">
                    {!o.stale && <Trend price={o.price} prevPrice={o.prevPrice} />}
                    <span className={cn("font-semibold", isBest && "text-emerald-700 dark:text-emerald-400")}>
                      {isBest && <Trophy className="mr-1 inline size-3.5" />}
                      {money(o.price, o.currency)}
                    </span>
                  </span>
                  {(o.priceBasis || (o.currency !== "AED" && o.priceAed != null)) && (
                    <span className="text-[11px] text-muted-foreground">
                      {o.currency !== "AED" && o.priceAed != null && `≈ AED ${Math.round(o.priceAed).toLocaleString("en-US")}`}
                      {o.currency !== "AED" && o.priceAed != null && o.priceBasis && " · "}
                      {o.priceBasis}
                    </span>
                  )}
                </div>
              )}
            </td>
            <td className="hidden px-3 py-1 text-right text-xs tabular-nums sm:table-cell">
              {diff != null && diff > 0 ? `+${diff.toLocaleString()}` : diff === 0 ? "" : "—"}
            </td>
            <td className="hidden max-w-[420px] truncate px-3 py-1 md:table-cell">
              {[o.cpu, o.ramGb ? `${o.ramGb}GB` : "", o.storage, o.display, o.gpu, o.os, o.extras].filter(Boolean).join(" · ")}
            </td>
            <td className="hidden px-3 py-1 text-xs sm:table-cell">
              {o.condition !== "new" && <Badge variant="outline" className="mr-1">{o.condition}</Badge>}
              {o.stockNote}
            </td>
            <td className="hidden px-3 py-1 text-right text-xs whitespace-nowrap sm:table-cell">
              <Tooltip>
                <TooltipTrigger render={<Link href={`/procurement/import/${o.priceListId}`} className="inline-flex items-center gap-1 hover:underline" />}>
                  {ago(o.receivedAt)}
                  {o.stale && <Badge variant="outline" className="ml-1">old</Badge>}
                  <ExternalLink className="size-3" />
                </TooltipTrigger>
                <TooltipContent className="max-w-sm">
                  <p className="mb-1 font-medium">
                    {new Date(o.receivedAt).toLocaleString()}
                    {o.stale ? ` · older than ${staleDays} days` : ""}
                  </p>
                  <pre className="font-mono text-xs whitespace-pre-wrap">{o.rawText}</pre>
                </TooltipContent>
              </Tooltip>
            </td>
          </tr>
        );
      })}
    </tbody>
  );
}

function ProductTitle({ p, suppliers }: { p: ProductHit; suppliers: number }) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/procurement/products/${p.id}`} className="font-semibold hover:underline">
          {p.label}
        </Link>
        <Badge variant="outline" className="capitalize">{p.category}</Badge>
        {suppliers > 1 && <Badge variant="secondary">{suppliers} suppliers</Badge>}
      </div>
      {p.specSummary && <p className="truncate text-xs text-muted-foreground">{p.specSummary}</p>}
    </>
  );
}

function BestPrice({ p, saving, staleDays, align = "end" }: { p: ProductHit; saving: number; staleDays: number; align?: "start" | "end" }) {
  return (
    <div className={cn("flex items-center gap-3", align === "start" ? "justify-start" : "justify-end")}>
      <div className={align === "start" ? "text-left" : "text-right"}>
        <div className="text-sm font-semibold tabular-nums">
          <span className="mr-1.5 text-[11px] font-normal text-muted-foreground">Best</span>
          {p.bestPrice != null ? money(p.bestPrice, p.bestCurrency ?? "AED") : "On request"}
        </div>
        {saving > 0 && (
          <div className="text-[11px] text-emerald-700 dark:text-emerald-400">
            saves up to {p.bestCurrency ?? ""} {Math.round(saving).toLocaleString("en-US")}
          </div>
        )}
      </div>
      <CopyButton text={() => quoteText(p, staleDays)} label="Copy quote" variant="ghost" iconOnly />
    </div>
  );
}
