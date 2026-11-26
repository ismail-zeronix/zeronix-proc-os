"use client";

import { Check, ChevronDown, ChevronRight, Plus, X } from "lucide-react";
import { useState } from "react";
import { CustomerPicker } from "@/components/party-pickers";
import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { ImportContext, PartyChoice, PartyState } from "./types";

/**
 * Each distinct customer (or supplier) name in the paste, once: matched to an existing one, or added as new. One choice
 * here maps every document that uses the name.
 */
export function PartyPanel({ kind, parties, suppliers, onChoose }: { kind: "invoice" | "bill"; parties: Record<string, PartyState>; suppliers: ImportContext["suppliers"]; onChoose: (key: string, choice: PartyChoice) => void }) {
  const [open, setOpen] = useState(true);
  const rows = Object.entries(parties);
  const toAdd = rows.filter(([, p]) => !p.choice).length;
  const noun = kind === "invoice" ? "Customers" : "Suppliers";
  return (
    <section className="rounded-lg border bg-card" aria-label={noun}>
      <button type="button" className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm font-medium" onClick={() => setOpen(!open)} aria-expanded={open}>
        {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        {noun} in this paste
        <span className="text-xs font-normal text-muted-foreground">
          {rows.length} {rows.length === 1 ? "name" : "names"} · {rows.length - toAdd} matched · {toAdd} will be added
        </span>
      </button>
      {open && (
        <ul className="grid gap-1 border-t px-3 py-2">
          {rows.map(([key, p]) => (
            <li key={key} className="grid items-center gap-x-3 gap-y-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium" title={p.name}>
                  {p.name}
                </div>
                <div className="text-xs text-muted-foreground">
                  {p.docs} document{p.docs === 1 ? "" : "s"}
                </div>
              </div>
              <div className="min-w-0">
                {kind === "invoice" ? <CustomerChoice p={p} onChoose={(c) => onChoose(key, c)} /> : <SupplierChoice p={p} suppliers={suppliers} onChoose={(c) => onChoose(key, c)} />}
                {!p.choice && p.maybe.length > 0 && (
                  <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                    Close match:
                    {p.maybe.map((m) => (
                      <Button key={m.id} type="button" variant="outline" size="xs" onClick={() => onChoose(key, m)}>
                        {m.name}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Chosen({ name, exact, onClear }: { name: string; exact: boolean; onClear: () => void }) {
  return (
    <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-2.5 py-1 text-sm">
      <Check className="size-4 shrink-0 text-emerald-600" />
      <span className="min-w-0 flex-1 truncate" title={name}>
        {name}
      </span>
      <span className="text-xs text-muted-foreground">{exact ? "existing" : "picked"}</span>
      <Button type="button" variant="ghost" size="icon-xs" aria-label="Use a different one" title="Use a different one" onClick={onClear}>
        <X />
      </Button>
    </div>
  );
}

function CustomerChoice({ p, onChoose }: { p: PartyState; onChoose: (c: PartyChoice) => void }) {
  const [picking, setPicking] = useState(false);
  if (p.choice && !picking) return <Chosen name={p.choice.name} exact={p.choice.id === p.exact?.id} onClear={() => onChoose(null)} />;
  return (
    <div className="grid gap-1">
      <div className="flex items-center gap-2 text-sm">
        <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-1 text-amber-800 dark:text-amber-300">
          <Plus className="size-3.5" /> Will be added as a new customer
        </span>
        <Button type="button" variant="outline" size="xs" onClick={() => setPicking(!picking)}>
          {picking ? "Cancel" : "Pick existing"}
        </Button>
      </div>
      {picking && (
        <CustomerPicker
          id={`pp-${p.name}`}
          value={null}
          onChange={(c) => {
            if (c) {
              onChoose({ id: c.id, name: c.name });
              setPicking(false);
            }
          }}
        />
      )}
    </div>
  );
}

function SupplierChoice({ p, suppliers, onChoose }: { p: PartyState; suppliers: ImportContext["suppliers"]; onChoose: (c: PartyChoice) => void }) {
  return (
    <NativeSelect aria-label={`Supplier for ${p.name}`} value={p.choice ? String(p.choice.id) : "new"} onChange={(e) => onChoose(e.target.value === "new" ? null : (suppliers.find((s) => String(s.id) === e.target.value) ?? null))}>
      <NativeSelectOption value="new">Add as a new supplier</NativeSelectOption>
      {(p.choice && !suppliers.some((s) => s.id === p.choice!.id) ? [...suppliers, { id: p.choice.id, name: p.choice.name, termsDays: 30 }] : suppliers).map((s) => (
        <NativeSelectOption key={s.id} value={String(s.id)}>
          {s.name}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );
}
