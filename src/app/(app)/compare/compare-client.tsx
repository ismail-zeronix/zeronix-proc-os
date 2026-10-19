"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ClipboardPaste, Download, ExternalLink, Search, Trophy } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { CopyButton } from "@/components/copy-button";
import { SupplierTypeBadge } from "@/components/supplier-type-badge";
import { Trend } from "@/components/trend";
import { SUPPLIER_TYPES } from "@/lib/supplier-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { quoteText } from "@/lib/export";
import { ago, money } from "@/lib/format";
import type { ProductHit } from "@/lib/search";
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

export function CompareClient() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");

  // debounce typing into the URL (the URL is the state, so a search can be shared as a link)
  useEffect(() => {
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

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Compare prices</h1>
          {meta.data && (
            <p className="text-sm text-muted-foreground">
              {meta.data.stats.products} products · {meta.data.stats.offers} offers from {meta.data.stats.suppliers}{" "}
              suppliers{meta.data.stats.last ? ` · last list ${ago(meta.data.stats.last)}` : ""}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            nativeButton={false}
            render={<a href={`/api/export?${qs.toString()}`} download />}
            disabled={!results.data?.total}
          >
            <Download /> Export CSV
          </Button>
          <Button nativeButton={false} render={<Link href="/import" />}>
            <ClipboardPaste /> Paste price list
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="grid gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder='Model, part number or spec: "FM0013DX", "probook 440", "i5 13420h 16gb", "ultra 7"'
              className="h-10 pl-9 text-base"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Filter value={sp.get("category") ?? ""} onChange={(v) => setParam("category", v)} label="All categories">
              {meta.data?.categories.map((c) => <NativeSelectOption key={c} value={c}>{c}</NativeSelectOption>)}
            </Filter>
            <Filter value={sp.get("brand") ?? ""} onChange={(v) => setParam("brand", v)} label="All brands">
              {meta.data?.brands.map((b) => <NativeSelectOption key={b} value={b}>{b}</NativeSelectOption>)}
            </Filter>
            <Filter value={sp.get("type") ?? ""} onChange={(v) => setParam("type", v)} label="All supplier types">
              {SUPPLIER_TYPES.filter((t) => meta.data?.types.includes(t.key)).map((t) => (
                <NativeSelectOption key={t.key} value={t.key}>{t.label}</NativeSelectOption>
              ))}
            </Filter>
            <Filter value={sp.get("supplier") ?? ""} onChange={(v) => setParam("supplier", v)} label="All suppliers">
              {meta.data?.suppliers.map((s) => (
                <NativeSelectOption key={s.id} value={String(s.id)}>{s.name}</NativeSelectOption>
              ))}
            </Filter>
            <Filter value={sp.get("ram") ?? ""} onChange={(v) => setParam("ram", v)} label="Any RAM">
              {meta.data?.rams.map((r) => <NativeSelectOption key={r} value={String(r)}>{r} GB</NativeSelectOption>)}
            </Filter>
            <Filter value={sp.get("days") ?? ""} onChange={(v) => setParam("days", v)} label="Any date">
              <NativeSelectOption value="3">Last 3 days</NativeSelectOption>
              <NativeSelectOption value="7">Last 7 days</NativeSelectOption>
              <NativeSelectOption value="14">Last 14 days</NativeSelectOption>
              <NativeSelectOption value="30">Last 30 days</NativeSelectOption>
              <NativeSelectOption value="90">Last 90 days</NativeSelectOption>
            </Filter>
            <Filter value={sp.get("sort") ?? ""} onChange={(v) => setParam("sort", v)} label="Most suppliers first">
              <NativeSelectOption value="price">Cheapest first</NativeSelectOption>
              <NativeSelectOption value="spread">Biggest saving first</NativeSelectOption>
              <NativeSelectOption value="recent">Newest first</NativeSelectOption>
            </Filter>
            <Label className="ml-1 flex items-center gap-2 text-sm font-normal">
              <Checkbox checked={sp.get("priced") === "1"} onCheckedChange={(c) => setParam("priced", c ? "1" : "")} />
              With price only
            </Label>
            <Label className="ml-1 flex items-center gap-2 text-sm font-normal" title="Hide offers that are on order or out of stock">
              <Checkbox checked={sp.get("ready") === "1"} onCheckedChange={(c) => setParam("ready", c ? "1" : "")} />
              Ready stock only
            </Label>
            <Label className="ml-1 flex items-center gap-2 text-sm font-normal">
              <Checkbox checked={sp.get("history") === "1"} onCheckedChange={(c) => setParam("history", c ? "1" : "")} />
              Include older offers
            </Label>
            {qs.toString() && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setQ("");
                  router.replace(pathname);
                }}
              >
                Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {empty ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="font-medium">No prices yet</p>
            <p className="mb-4 text-sm text-muted-foreground">Paste a supplier WhatsApp price list to get started.</p>
            <Button nativeButton={false} render={<Link href="/import" />}>
              <ClipboardPaste /> Paste price list
            </Button>
          </CardContent>
        </Card>
      ) : results.isLoading ? (
        <div className="grid gap-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-40 w-full" />)}
        </div>
      ) : (
        <div className={cn("grid gap-3", results.isFetching && "opacity-70 transition-opacity")}>
          <p className="text-xs text-muted-foreground">
            {results.data?.total ?? 0} product{results.data?.total === 1 ? "" : "s"}
            {results.data && results.data.total > results.data.products.length
              ? `, showing first ${results.data.products.length}. Refine the search to narrow down`
              : ""}
            {results.data?.fuzzy ? ". No exact match, showing similar products" : ""}
          </p>
          {results.data && !results.data.products.length && (
            <Card>
              <CardContent className="py-10 text-center">
                <p className="font-medium">Nothing matches{q.trim() ? ` “${q.trim()}”` : " these filters"}</p>
                <p className="mb-3 text-sm text-muted-foreground">
                  Try fewer words, a part number, or switch on “Include older offers”.
                </p>
                <Button
                  variant="outline"
                  onClick={() => {
                    setQ("");
                    router.replace(pathname);
                  }}
                >
                  Clear search and filters
                </Button>
              </CardContent>
            </Card>
          )}
          {results.data?.products.map((p) => (
            <ProductCard key={p.id} p={p} staleDays={results.data!.staleDays} />
          ))}
        </div>
      )}
    </div>
  );
}

function Filter({
  value,
  onChange,
  label,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <NativeSelect size="sm" value={value} onChange={(e) => onChange(e.target.value)} className="w-auto">
      <NativeSelectOption value="">{label}</NativeSelectOption>
      {children}
    </NativeSelect>
  );
}

function ProductCard({ p, staleDays }: { p: ProductHit; staleDays: number }) {
  const suppliers = new Set(p.offers.map((o) => o.supplierId)).size;
  const saving = p.bestPrice != null && p.worstPrice != null ? p.worstPrice - p.bestPrice : 0;
  return (
    <Card className="gap-0 py-0">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/products/${p.id}`} className="font-semibold hover:underline">
              {p.label}
            </Link>
            <Badge variant="outline" className="capitalize">{p.category}</Badge>
            <Badge variant="secondary">{suppliers} supplier{suppliers > 1 ? "s" : ""}</Badge>
          </div>
          {p.specSummary && <p className="truncate text-sm text-muted-foreground">{p.specSummary}</p>}
        </div>
        <div className="flex items-start gap-3">
          <CopyButton text={() => quoteText(p, staleDays)} label="Copy quote" size="xs" variant="ghost" />
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Best price</div>
            <div className="text-lg font-semibold tabular-nums">
              {p.bestPrice != null ? money(p.bestPrice, p.bestCurrency ?? "AED") : "On request"}
            </div>
            {saving > 0 && (
              <div className="text-xs text-emerald-700 dark:text-emerald-400">
                saves up to {p.bestCurrency ?? ""} {Math.round(saving).toLocaleString("en-US")} vs dearest
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Supplier</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead className="hidden text-right sm:table-cell">vs best</TableHead>
              <TableHead className="hidden md:table-cell">Spec as quoted</TableHead>
              <TableHead className="hidden sm:table-cell">Stock / notes</TableHead>
              <TableHead className="pr-4 text-right">Received</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {p.offers.map((o) => {
              const isBest = o.id === p.bestOfferId && !o.stale;
              // the gap to the best price is always in AED, so a USD sheet and an AED list compare fairly
              const diff =
                o.priceAed != null && p.bestPrice != null && p.bestCurrency === "AED"
                  ? Math.round(o.priceAed - p.bestPrice)
                  : null;
              return (
                <TableRow key={o.id} className={cn(o.stale && "text-muted-foreground", isBest && "bg-emerald-500/5")}>
                  <TableCell className="pl-4 font-medium">
                    <Link href={`/suppliers/${o.supplierId}`} className="hover:underline">
                      {o.supplierName}
                    </Link>
                    <SupplierTypeBadge type={o.supplierType} short className="ml-2 align-middle" />
                    {o.stockNote && <span className="block text-xs font-normal text-muted-foreground sm:hidden">{o.stockNote}</span>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
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
                  </TableCell>
                  <TableCell className="hidden text-right text-xs tabular-nums sm:table-cell">
                    {diff != null && diff > 0 ? `+${diff.toLocaleString()}` : diff === 0 ? "" : "—"}
                  </TableCell>
                  <TableCell className="hidden max-w-[420px] truncate text-sm md:table-cell">
                    {[o.cpu, o.ramGb ? `${o.ramGb}GB` : "", o.storage, o.display, o.gpu, o.os, o.extras]
                      .filter(Boolean)
                      .join(" · ")}
                  </TableCell>
                  <TableCell className="hidden text-xs sm:table-cell">
                    {o.condition !== "new" && <Badge variant="outline" className="mr-1">{o.condition}</Badge>}
                    {o.stockNote}
                  </TableCell>
                  <TableCell className="pr-4 text-right text-xs whitespace-nowrap">
                    <Tooltip>
                      <TooltipTrigger
                        render={<Link href={`/import/${o.priceListId}`} className="inline-flex items-center gap-1 hover:underline" />}
                      >
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
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
