"use client";

import { ClipboardPaste, FileUp, Loader2, Send, Square } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { existingDocs, importBill, importContext, importInvoice, matchCustomers, type ImportBillActionInput, type ImportInvoiceActionInput } from "@/app/(app)/accounts/import-actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { cellOf, guessColumns, missingFields, type Mapping } from "@/lib/import/columns";
import { buildDrafts, checkDoc, fieldsOf, type DraftDoc, type DraftLine, type DraftPaid } from "@/lib/import/docs";
import { PURCHASE_TAX_CODES, SALES_TAX_CODES, taxCodeOptions } from "@/lib/tax/doc-tax";
import { parseCsv } from "@/lib/prospecting/import";
import { money } from "@/lib/quotation";
import { normName } from "@/lib/sales";
import { errorText } from "@/lib/user-error";
import { DocBlock, type BlockFlags } from "./doc-block";
import { PartyPanel } from "./party-panel";
import type { ImportContext, PartyChoice, PartyState, UiDoc } from "./types";

type Step = "paste" | "map" | "review";
type Filter = "all" | "ready" | "problems" | "done";

const EMPTY_CTX: ImportContext = { today: "", hasOurTrn: true, banks: [], suppliers: [] };

/** A supplier the name matches (same spelling rules as customers), and close ones. */
function matchSuppliers(names: string[], suppliers: ImportContext["suppliers"]): Record<string, { exact: { id: number; name: string } | null; maybe: { id: number; name: string }[] }> {
  const out: Record<string, { exact: { id: number; name: string } | null; maybe: { id: number; name: string }[] }> = {};
  for (const name of names) {
    const n = normName(name);
    const exact = suppliers.find((s) => normName(s.name) === n) ?? null;
    const maybe = exact || n.length < 4 ? [] : suppliers.filter((s) => { const m = normName(s.name); return m.length >= 4 && (m.includes(n) || n.includes(m)); }).slice(0, 3);
    out[name] = { exact: exact && { id: exact.id, name: exact.name }, maybe: maybe.map((s) => ({ id: s.id, name: s.name })) };
  }
  return out;
}

/**
 * Accounts › Invoices / Bills › Import: paste CSV, press OK, review one editable block per document (customer or supplier
 * mapped, VAT per line, ticks), then Submit. Each ticked document is saved on its own, one after the other, so one that
 * is refused never undoes the rest; it stays in the table with the reason and can be fixed and sent again.
 */
export function ImportDocsDialog({ kind }: { kind: "invoice" | "bill" }) {
  const router = useRouter();
  const inv = kind === "invoice";
  const fields = fieldsOf(kind);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("paste");
  const [text, setText] = useState("");
  const [rows, setRows] = useState<string[][]>([]);
  const [map, setMap] = useState<Mapping>({});
  const [docs, setDocs] = useState<UiDoc[]>([]);
  const [parties, setParties] = useState<Record<string, PartyState>>({});
  const [existing, setExisting] = useState<Set<string>>(new Set());
  const [ctx, setCtx] = useState<ImportContext>(EMPTY_CTX);
  const [filter, setFilter] = useState<Filter>("all");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [skipped, setSkipped] = useState(0);
  const [reading, setReading] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const stop = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStep("paste");
    setText("");
    setRows([]);
    setMap({});
    setDocs([]);
    setParties({});
    setExisting(new Set());
    setFilter("all");
    setCollapsed(new Set());
    setSkipped(0);
    setReading(false);
    setRunning(false);
    setProgress({ done: 0, total: 0 });
  };

  const onOpenChange = (o: boolean) => {
    if (!o && running) return;
    setOpen(o);
    if (o) {
      reset();
      importContext(kind).then(setCtx, (e) => toast.error(errorText(e)));
    }
  };

  // ---- paste → map → review ----
  const loadFile = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 5_000_000) return toast.error("That file is over 5 MB.");
    setText(await f.text());
  };

  const build = async (grid: string[][], m: Mapping) => {
    const { docs: drafts, skipped: skip } = buildDrafts(kind, grid.slice(1), m);
    if (!drafts.length) return toast.error("No rows with a number were found. Check the columns.");
    setReading(true);
    try {
      const names = [...new Set(drafts.map((d) => d.party).filter(Boolean))];
      const matches = inv ? await matchCustomers(names) : matchSuppliers(names, ctx.suppliers);
      const ps: Record<string, PartyState> = {};
      for (const d of drafts) {
        const key = normName(d.party);
        if (ps[key]) {
          ps[key].docs++;
          continue;
        }
        const mt = matches[d.party] ?? { exact: null, maybe: [] };
        ps[key] = { name: d.party, docs: 1, choice: mt.exact, exact: mt.exact, maybe: mt.maybe };
      }
      setParties(ps);
      setDocs(drafts.map((d) => ({ ...d, ticked: true, status: "idle", message: "", result: null })));
      setSkipped(skip);
      setCollapsed(new Set(drafts.length > 25 ? drafts.map((d) => d.key) : []));
      setStep("review");
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setReading(false);
    }
  };

  const ok = () => {
    const grid = parseCsv(text);
    if (grid.length < 2) return toast.error("Paste the header row and at least one line of data.");
    const m = guessColumns(grid[0], fields);
    setRows(grid);
    setMap(m);
    if (missingFields(fields, m).length) setStep("map");
    else void build(grid, m);
  };

  // ---- edits ----
  const patchDoc = useCallback((key: string, patch: Partial<UiDoc>) => setDocs((ds) => ds.map((d) => (d.key === key ? { ...d, ...patch } : d))), []);
  const patchLine = useCallback((key: string, i: number, patch: Partial<DraftLine>) => setDocs((ds) => ds.map((d) => (d.key === key ? { ...d, lines: d.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) } : d))), []);
  const addLine = useCallback((key: string) => setDocs((ds) => ds.map((d) => (d.key === key ? { ...d, lines: [...d.lines, { description: "", qty: 1, price: 0, kind: d.lines.at(-1)?.kind ?? "product", taxCode: d.lines.at(-1)?.taxCode ?? "SR" }] } : d))), []);
  const removeLine = useCallback((key: string, i: number) => setDocs((ds) => ds.map((d) => (d.key === key ? { ...d, lines: d.lines.filter((_, j) => j !== i) } : d))), []);
  const patchPaid = useCallback((key: string, patch: Partial<DraftPaid>) => setDocs((ds) => ds.map((d) => (d.key === key ? { ...d, paid: { ...d.paid, ...patch } } : d))), []);
  const toggleCollapsed = useCallback((key: string) => setCollapsed((s) => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n; }), []);
  const choose = useCallback((key: string, choice: PartyChoice) => setParties((p) => ({ ...p, [key]: { ...p[key], choice } })), []);

  // ---- what is already in the system ----
  const sig = useMemo(() => docs.map((d) => `${d.number}|${parties[normName(d.party)]?.choice?.id ?? ""}`).join(";"), [docs, parties]);
  useEffect(() => {
    if (step !== "review" || !docs.length) return;
    const t = setTimeout(() => {
      existingDocs(kind, docs.map((d) => ({ number: d.number, partyId: parties[normName(d.party)]?.choice?.id ?? null }))).then((keys) => setExisting(new Set(keys.map((k) => k.toLowerCase()))), () => undefined);
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, step, kind]);

  const keyOf = useCallback(
    (d: DraftDoc) => (inv ? d.number.trim().toLowerCase() : `${normName(d.party)}|${d.number.trim().toLowerCase()}`),
    [inv],
  );
  const flags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const d of docs) counts.set(keyOf(d), (counts.get(keyOf(d)) ?? 0) + 1);
    const m = new Map<string, BlockFlags>();
    for (const d of docs) {
      const p = parties[normName(d.party)];
      const existsKey = inv ? d.number.trim().toLowerCase() : p?.choice ? `${p.choice.id}|${d.number.trim().toLowerCase()}` : "";
      m.set(d.key, { exists: !!existsKey && existing.has(existsKey), duplicate: (counts.get(keyOf(d)) ?? 0) > 1, partyReady: d.party.trim().length >= 2, partyName: p?.choice?.name ?? "" });
    }
    return m;
  }, [docs, parties, existing, inv, keyOf]);

  const checks = useMemo(() => new Map(docs.map((d) => [d.key, checkDoc(d, { today: ctx.today, exists: flags.get(d.key)!.exists, duplicateInBatch: flags.get(d.key)!.duplicate, partyReady: flags.get(d.key)!.partyReady, hasOurTrn: ctx.hasOurTrn })])), [docs, flags, ctx]);

  const isReady = (d: UiDoc) => d.status !== "done" && d.status !== "running" && (checks.get(d.key)?.errors.length ?? 1) === 0;
  const ready = docs.filter(isReady);
  const picked = ready.filter((d) => d.ticked);
  const done = docs.filter((d) => d.status === "done").length;
  const failed = docs.filter((d) => d.status === "failed").length;
  const problems = docs.filter((d) => d.status !== "done" && !isReady(d)).length;
  const shown = docs.filter((d) => (filter === "all" ? true : filter === "ready" ? isReady(d) : filter === "problems" ? d.status !== "done" && !isReady(d) : d.status === "done"));
  const allTicked = ready.length > 0 && picked.length === ready.length;
  const totalPicked = picked.reduce((s, d) => s + (checks.get(d.key)?.tax.total ?? 0), 0);

  // ---- batch changes ----
  const setAllCodes = (code: string) => setDocs((ds) => ds.map((d) => (d.status === "done" ? d : { ...d, lines: d.lines.map((l) => ({ ...l, taxCode: code })) })));
  const setAllBasis = (basis: "net" | "gross") => setDocs((ds) => ds.map((d) => (d.status === "done" ? d : { ...d, basis })));

  // ---- submit ----
  const inputOf = (d: UiDoc) => {
    const p = parties[normName(d.party)];
    const lines = d.lines.map((l) => ({ description: l.description, qty: l.qty, price: l.price, kind: l.kind, taxCode: l.taxCode }));
    const paid = d.paid.on ? { amount: d.paid.amount, date: d.paid.date, method: d.paid.method, bankAccountId: d.paid.bankAccountId, reference: d.paid.reference } : null;
    const base = { number: d.number, date: d.date, termsDays: d.termsDays, basis: d.basis, lines, paid, partyId: p?.choice?.id ?? null };
    return inv
      ? ({ ...base, customerRef: d.ref, address: d.address, lines: lines as ImportInvoiceActionInput["lines"], newParty: p?.choice ? null : { name: d.party, address: d.address } } as ImportInvoiceActionInput)
      : ({ ...base, category: d.category, notes: d.ref, vatOverride: d.vatOverride, lines: lines as ImportBillActionInput["lines"], newParty: p?.choice ? null : { name: d.party } } as ImportBillActionInput);
  };

  const submit = async () => {
    const todo = picked;
    if (!todo.length) return;
    stop.current = false;
    setRunning(true);
    setProgress({ done: 0, total: todo.length });
    let saved = 0;
    let bad = 0;
    for (const [i, d] of todo.entries()) {
      if (stop.current) break;
      patchDoc(d.key, { status: "running", message: "" });
      try {
        const r = inv ? await importInvoice(inputOf(d) as ImportInvoiceActionInput) : await importBill(inputOf(d) as ImportBillActionInput);
        patchDoc(d.key, { status: "done", result: { id: r.id, number: r.number, paymentNumber: r.paymentNumber } });
        setParties((p) => ({ ...p, [normName(d.party)]: { ...p[normName(d.party)], choice: { id: r.partyId, name: r.partyName } } }));
        saved++;
      } catch (e) {
        patchDoc(d.key, { status: "failed", message: errorText(e), ticked: false });
        bad++;
      }
      setProgress({ done: i + 1, total: todo.length });
    }
    setRunning(false);
    router.refresh();
    if (saved) toast.success(`${saved} ${inv ? "invoice" : "bill"}${saved === 1 ? "" : "s"} saved${bad ? `, ${bad} refused` : ""}`);
    else if (bad) toast.error(`${bad} refused. The reason is shown on each one.`);
  };

  const highest = useMemo(() => docs.filter((d) => d.status === "done").map((d) => d.number).sort().at(-1) ?? "", [docs]);

  const codeOptions = taxCodeOptions(inv ? SALES_TAX_CODES : PURCHASE_TAX_CODES);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm" title={`Paste a CSV of ${inv ? "invoices" : "supplier bills"} and review them before saving`}>
            <ClipboardPaste /> Import
          </Button>
        }
      />
      <DialogContent className="h-[94dvh] content-start sm:max-w-[min(96vw,92rem)]" showCloseButton={!running}>
        <DialogHeader>
          <DialogTitle>{inv ? "Import invoices" : "Import supplier bills"}</DialogTitle>
          <DialogDescription>
            {step === "paste" && "Paste CSV (from Zoho, Excel or a sheet) with a header row, then press OK. Nothing is saved until you submit."}
            {step === "map" && "Some columns were not recognised. Say which column holds each field."}
            {step === "review" && `${docs.length} ${inv ? "invoices" : "bills"} read. Fix anything in the table, tick the ones to save, then submit.${skipped ? ` ${skipped} row${skipped === 1 ? "" : "s"} without a number were skipped.` : ""}`}
          </DialogDescription>
        </DialogHeader>

        {step === "paste" && (
          <div className="grid gap-3">
            <Textarea aria-label="CSV text" className="min-h-72 font-mono text-xs" placeholder={inv ? "Invoice Date,Invoice Number,Customer Name,Item Desc,Quantity,Item Total,Item Tax %,Total,Balance,Last Payment Date,Billing Address\n2026-11-05,INV-0001,ACME LLC,Laptop,2,5800,5,6090,0,2026-11-10,Dubai" : "Bill Date,Bill Number,Vendor Name,Description,Quantity,Rate,Tax %,Account\n2026-11-05,B-1001,ALTWFEEQ,Laptop,2,2900,5,Cost of Goods Sold"} value={text} onChange={(e) => setText(e.target.value)} />
            <div className="flex flex-wrap items-center gap-2">
              <input ref={fileInput} type="file" accept=".csv,.txt,text/csv,text/plain" className="hidden" onChange={(e) => void loadFile(e.target.files?.[0])} />
              <Button type="button" variant="outline" size="sm" onClick={() => fileInput.current?.click()}>
                <FileUp /> Load a .csv file
              </Button>
              <span className="text-xs text-muted-foreground">Comma, semicolon or tab separated; amounts before VAT unless a column says the amounts include VAT.</span>
              <Button className="ml-auto" disabled={!text.trim() || reading} onClick={ok}>
                {reading ? <Loader2 className="animate-spin" /> : null} OK
              </Button>
            </div>
          </div>
        )}

        {step === "map" && (
          <div className="grid gap-3">
            <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {fields.map((f) => (
                <label key={f.key} className="grid gap-1 rounded-md border p-2 text-sm">
                  <span className="font-medium">
                    {f.label}
                    {f.required && <span className="text-red-600"> *</span>}
                  </span>
                  <NativeSelect aria-label={f.label} value={map[f.key] === undefined ? "" : String(map[f.key])} onChange={(e) => setMap((m) => { const n = { ...m }; if (e.target.value === "") delete n[f.key]; else n[f.key] = Number(e.target.value); return n; })}>
                    <NativeSelectOption value="">Not in the file</NativeSelectOption>
                    {rows[0]?.map((h, i) => (
                      <NativeSelectOption key={i} value={String(i)}>
                        {h || `Column ${i + 1}`}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                  <span className="truncate text-xs text-muted-foreground">{map[f.key] !== undefined ? `e.g. ${cellOf(rows[1] ?? [], map, f.key) || "(empty)"}` : " "}</span>
                </label>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => setStep("paste")}>
                Back
              </Button>
              <Button className="ml-auto" disabled={missingFields(fields, map).length > 0 || reading} onClick={() => void build(rows, map)}>
                {reading ? <Loader2 className="animate-spin" /> : null} Build the review table
              </Button>
              {missingFields(fields, map).length > 0 && <span className="text-xs text-red-600">Still needed: {missingFields(fields, map).map((f) => f.label).join(", ")}</span>}
            </div>
          </div>
        )}

        {step === "review" && (
          <div className="grid gap-2">
            {!ctx.hasOurTrn && inv && <p className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">Our TRN is not set, so no invoice can be saved. An admin adds it in Admin › Settings › Company & branding.</p>}
            <div className="sticky -top-4 z-10 -mx-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b bg-popover px-4 py-2">
              <label className="inline-flex cursor-pointer items-center gap-1.5 text-sm">
                <Checkbox
                  aria-label="Select all"
                  checked={allTicked}
                  indeterminate={picked.length > 0 && !allTicked}
                  disabled={running || !ready.length}
                  onCheckedChange={(v) => setDocs((ds) => ds.map((d) => (isReady(d) ? { ...d, ticked: !!v } : d)))}
                />
                Select all
              </label>
              <span className="text-sm text-muted-foreground">
                {docs.length} read · {ready.length} ready · {problems} need attention · {done} saved{failed ? ` · ${failed} refused` : ""}
              </span>
              <NativeSelect aria-label="Show" className="w-32" value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
                <NativeSelectOption value="all">Show all</NativeSelectOption>
                <NativeSelectOption value="ready">Ready</NativeSelectOption>
                <NativeSelectOption value="problems">Needs attention</NativeSelectOption>
                <NativeSelectOption value="done">Saved</NativeSelectOption>
              </NativeSelect>
              <NativeSelect aria-label="Set the VAT of every line" className="w-44" value="" disabled={running} onChange={(e) => e.target.value && setAllCodes(e.target.value)}>
                <NativeSelectOption value="">Set all lines to…</NativeSelectOption>
                {codeOptions.map((o) => (
                  <NativeSelectOption key={o.code} value={o.code}>
                    {o.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <NativeSelect aria-label="Set whether the amounts include VAT" className="w-44" value="" disabled={running} onChange={(e) => e.target.value && setAllBasis(e.target.value as "net" | "gross")}>
                <NativeSelectOption value="">Set all amounts to…</NativeSelectOption>
                <NativeSelectOption value="net">Before VAT</NativeSelectOption>
                <NativeSelectOption value="gross">Include VAT</NativeSelectOption>
              </NativeSelect>
              <Button variant="ghost" size="sm" disabled={running} onClick={() => setStep(missingFields(fields, map).length ? "map" : "paste")}>
                Start over
              </Button>
              <span className="ml-auto flex items-center gap-2">
                {running && (
                  <span className="text-sm text-muted-foreground" role="status">
                    Saving {progress.done} / {progress.total}
                  </span>
                )}
                {running ? (
                  <Button variant="outline" size="sm" onClick={() => (stop.current = true)}>
                    <Square /> Stop
                  </Button>
                ) : (
                  <Button size="sm" disabled={!picked.length || !ctx.today} onClick={() => void submit()} title={picked.length ? undefined : "Tick at least one document that is ready"}>
                    <Send /> Submit {picked.length} ({money(totalPicked)})
                  </Button>
                )}
              </span>
            </div>
            {running && <div className="h-1 overflow-hidden rounded bg-muted"><div className="h-full bg-primary transition-all" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} /></div>}
            {inv && highest && !running && <p className="text-xs text-muted-foreground">Highest number saved: {highest}. The series for new invoices is not changed: set the next number in Admin › Settings › Document numbers if it should continue after it.</p>}

            <PartyPanel kind={kind} parties={parties} suppliers={ctx.suppliers} onChoose={choose} />

            <div className="grid gap-2">
              {shown.map((d) => (
                <DocBlock
                  key={d.key}
                  doc={d}
                  flags={flags.get(d.key)!}
                  ctx={ctx}
                  collapsed={collapsed.has(d.key)}
                  busy={running}
                  onToggle={toggleCollapsed}
                  onDoc={patchDoc}
                  onLine={patchLine}
                  onAddLine={addLine}
                  onRemoveLine={removeLine}
                  onPaid={patchPaid}
                />
              ))}
              {!shown.length && <p className="py-6 text-center text-sm text-muted-foreground">Nothing in this view.</p>}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
