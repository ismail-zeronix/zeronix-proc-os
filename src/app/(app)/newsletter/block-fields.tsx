"use client";

import { Plus, Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BLOCK_DEFS, type FieldSpec } from "@/lib/newsletter/blocks";
import type { BlockType, ResolvedProduct } from "@/lib/newsletter/types";
import { searchSiteProducts } from "./actions";

interface Picked {
  id: number;
  name: string;
  brand: string;
  category: string;
}

export function Field({ spec, value, onChange, id }: { spec: FieldSpec; value: string; onChange: (v: string) => void; id: string }) {
  return (
    <div className="grid gap-1">
      <Label htmlFor={id} className="text-xs">
        {spec.label}
      </Label>
      {spec.kind === "select" ? (
        <NativeSelect className="w-full" id={id} value={value} onChange={(e) => onChange(e.target.value)}>
          {spec.options!.map(([v, l]) => (
            <NativeSelectOption key={v} value={v}>
              {l}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      ) : spec.kind === "area" || spec.kind === "lines" ? (
        <Textarea id={id} rows={spec.rows ?? 3} value={value} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <Input id={id} type={spec.kind === "url" ? "url" : "text"} value={value} onChange={(e) => onChange(e.target.value)} />
      )}
      {spec.hint && <p className="text-xs text-muted-foreground">{spec.hint}</p>}
    </div>
  );
}

export function ProductPicker({ ids, products, onChange }: { ids: number[]; products: ResolvedProduct[]; onChange: (ids: number[]) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Picked[]>([]);
  const [names, setNames] = useState<Record<number, string>>({});
  const max = 6;

  useEffect(() => {
    let live = true;
    const t = setTimeout(() => void searchSiteProducts(q).then((r) => live && setResults(r)), 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q]);

  return (
    <div className="grid gap-2">
      <Label className="text-xs">Products from the website (up to {max})</Label>
      {ids.length > 0 ? (
        <ul className="grid gap-1">
          {ids.map((pid) => {
            const p = products.find((x) => x.id === pid);
            return (
              <li key={pid} className="flex items-center justify-between gap-2 rounded-md border px-2 py-1 text-sm">
                <span className="truncate">
                  {p?.name ?? names[pid] ?? `Product ${pid}`} {!!p?.brand && <span className="text-xs text-muted-foreground">· {p.brand}</span>}
                </span>
                <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove product" title="Remove" onClick={() => onChange(ids.filter((x) => x !== pid))}>
                  <X />
                </Button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">No products picked: this section does not show in the email until you add some.</p>
      )}
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, brand or part number" className="pl-8" aria-label="Search website products" />
      </div>
      <ul className="grid max-h-48 gap-1 overflow-y-auto">
        {results
          .filter((r) => !ids.includes(r.id))
          .map((r) => (
            <li key={r.id}>
              <button
                type="button"
                disabled={ids.length >= max}
                className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1 text-left text-sm hover:bg-muted disabled:opacity-50"
                onClick={() => {
                  setNames({ ...names, [r.id]: r.name });
                  onChange([...ids, r.id]);
                }}
              >
                <span className="truncate">
                  {r.name} <span className="text-xs text-muted-foreground">· {r.brand || r.category}</span>
                </span>
                <Plus className="size-4 shrink-0" />
              </button>
            </li>
          ))}
        {!results.length && <li className="px-2 py-1 text-xs text-muted-foreground">No published products found.</li>}
      </ul>
    </div>
  );
}

/** The list of section types to add. */
export function SectionPicker({ open, onOpenChange, onPick }: { open: boolean; onOpenChange: (o: boolean) => void; onPick: (t: BlockType) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Add a section</DialogTitle>
          <DialogDescription>Pick what to add. You can type straight into it afterwards and move it with its toolbar.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {BLOCK_DEFS.map((d) => (
            <button key={d.type} type="button" className="rounded-lg border px-3 py-2 text-left hover:bg-muted" onClick={() => onPick(d.type)}>
              <div className="text-sm font-medium">{d.label}</div>
              <div className="text-xs text-muted-foreground">{d.hint}</div>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
