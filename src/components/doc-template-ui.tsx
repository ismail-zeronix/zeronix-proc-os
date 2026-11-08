"use client";

import { ChevronDown, RotateCcw, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { saveDocStyles } from "@/app/(app)/accounts/settings-actions";
import type { QuoteBrand } from "@/components/doc-parts";
import { FitWidth } from "@/components/fit-width";
import { QuoteDocument, type QuoteDocData } from "@/components/quote-document";
import { SalesDocument, type SalesDocData } from "@/components/sales-document";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { type DocStyle, type DocStyles, LIMITS, OPTIONS, type Preset, PRESET_LABELS, PRESETS, PRESETS_LIST, withAccent } from "@/lib/doc-style";
import { errorText } from "@/lib/user-error";

/** What the preview prints: made-up lines, never a real customer. */
const SAMPLE_ITEMS = [
  { id: 1, description: "Dell Latitude 5450 laptop\nIntel Core Ultra 5, 16 GB RAM, 512 GB SSD, 14\" FHD", qty: 5, unitPrice: 3950 },
  { id: 2, description: "Dell 24\" monitor P2425H", qty: 5, unitPrice: 720 },
  { id: 3, description: "Microsoft 365 Business Standard, 1 year", qty: 5, unitPrice: 545 },
  { id: 4, description: "Logitech MK270 wireless keyboard and mouse", qty: 5, unitPrice: 95 },
  { id: 5, description: "Installation, imaging and set-up on site", qty: 1, unitPrice: 750 },
];
const SUBTOTAL = SAMPLE_ITEMS.reduce((s, i) => s + i.qty * i.unitPrice, 0);
const VAT = Math.round(SUBTOTAL * 5) / 100;
const SAMPLE_QUOTE: QuoteDocData = {
  number: "ZQ-2026-0042",
  createdAt: new Date("2026-11-08T08:00:00Z"),
  validUntil: "2026-11-22",
  vatPct: 5,
  subtotal: SUBTOTAL,
  vatAmount: VAT,
  total: SUBTOTAL + VAT,
  terms: "Prices are in AED and include delivery within Dubai.\nPayment: 30 days from the invoice date.\nWarranty as per the manufacturer.",
  items: SAMPLE_ITEMS,
  company: { name: "Sample Trading LLC", emirate: "Dubai", address: "Office 204, Sample Tower\nBusiness Bay, Dubai, UAE", trn: "100000000000003", phone: "+971 4 000 0000" },
  contact: { name: "Sample Contact", jobTitle: "IT Manager", email: "it@sample.example", phone: "+971 50 000 0000" },
  author: { name: "Sales person", email: "sales@example.com", jobTitle: "Account Manager", phone: "", mobile: "+971 50 111 1111" },
};
const SAMPLE_INVOICE: SalesDocData = {
  title: "TAX INVOICE",
  number: "INV-00124",
  meta: [
    ["Invoice date", "8 November 2026"],
    ["Due date", "8 December 2026"],
    ["Terms", "Net 30"],
    ["Your PO", "PO-7781"],
    ["Order", "SO-2026-0042"],
  ],
  to: { name: "Sample Trading LLC", lines: ["Office 204, Sample Tower", "Business Bay, Dubai, UAE"], trn: "100000000000003" },
  shipTo: { label: "Deliver to", lines: ["Warehouse 7, Al Quoz 3", "Dubai, UAE"] },
  items: SAMPLE_ITEMS.map((i) => ({ ...i, taxCode: "SR" })),
  showPrices: true,
  vatPerLine: true,
  vatPct: 5,
  subtotal: SUBTOTAL,
  vatAmount: VAT,
  total: SUBTOTAL + VAT,
  amountInWords: true,
  notes: ["Goods remain our property until paid in full."],
  bank: { name: "Sample Bank", accountName: "Your company", accountNumber: "0123456789", iban: "AE07 0331 2345 6789 0123 456", swift: "SAMPAEAD" },
  preparedBy: "Accounts",
};

function Group({ title, children, open: first }: { title: string; children: React.ReactNode; open?: boolean }) {
  const [open, setOpen] = useState(!!first);
  return (
    <section className="rounded-lg border bg-card">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium" aria-expanded={open}>
        {title}
        <ChevronDown className={`size-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="grid gap-3 border-t px-3 py-3">{children}</div>}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** A row of small buttons, one of them on. */
function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: readonly (readonly [T, string])[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap gap-0.5 rounded-md border bg-muted/40 p-0.5">
      {options.map(([k, l]) => (
        <button
          key={k}
          type="button"
          role="radio"
          aria-checked={value === k}
          onClick={() => onChange(k)}
          className={`rounded px-2 py-0.5 text-xs transition-colors ${value === k ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

/** Colour well plus its hex; `auto` = the empty value (brand colour / automatic). */
function ColorField({ value, onChange, auto, fallback, label }: { value: string; onChange: (v: string) => void; auto?: string; fallback: string; label: string }) {
  const shown = value || fallback;
  return (
    <div className="flex items-center gap-1.5">
      <input type="color" aria-label={label} value={shown} onChange={(e) => onChange(e.target.value)} className="h-7 w-9 shrink-0 cursor-pointer rounded border bg-transparent p-0.5" />
      <Input
        aria-label={`${label} (hex)`}
        className="h-7 w-24 font-mono text-xs"
        value={value || (auto ? "" : shown)}
        placeholder={auto ? fallback : undefined}
        maxLength={7}
        onChange={(e) => {
          const v = e.target.value.trim();
          if (v === "" && auto) onChange("");
          else if (/^#[0-9a-f]{6}$/i.test(v)) onChange(v);
        }}
      />
      {auto && value && (
        <button type="button" className="text-xs text-muted-foreground underline" onClick={() => onChange("")}>
          {auto}
        </button>
      )}
    </div>
  );
}

function NumberField({ value, onChange, limits, step, label, unit }: { value: number; onChange: (v: number) => void; limits: readonly [number, number]; step: number; label: string; unit: string }) {
  return (
    <div className="flex items-center gap-2">
      <input type="range" aria-label={label} min={limits[0]} max={limits[1]} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-primary" />
      <span className="w-12 shrink-0 text-right text-xs tabular-nums">
        {value}
        {unit}
      </span>
    </div>
  );
}

function Check({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <Checkbox checked={checked} onCheckedChange={(v) => onChange(!!v)} /> {label}
    </label>
  );
}

/** Every control for one style. */
function StyleControls({ s, set, brandColor }: { s: DocStyle; set: (p: Partial<DocStyle>) => void; brandColor: string }) {
  return (
    <div className="grid gap-2">
      <Group title="Colours and font" open>
        <Row label="Main colour">
          <ColorField label="Main colour" value={s.accent} onChange={(v) => set({ accent: v })} auto="Brand colour" fallback={brandColor} />
        </Row>
        <Row label="Text">
          <ColorField label="Text colour" value={s.text} onChange={(v) => set({ text: v })} fallback="#171717" />
        </Row>
        <Row label="Font">
          <Segmented label="Font" value={s.font} options={OPTIONS.font} onChange={(v) => set({ font: v })} />
        </Row>
        <Row label="Size">
          <Segmented label="Size" value={s.size} options={OPTIONS.size} onChange={(v) => set({ size: v })} />
        </Row>
      </Group>
      <Group title="Header">
        <Row label="Layout">
          <Segmented label="Header layout" value={s.header} options={OPTIONS.header} onChange={(v) => set({ header: v })} />
        </Row>
        <Row label="Logo size">
          <Segmented label="Logo size" value={s.logoSize} options={OPTIONS.logoSize} onChange={(v) => set({ logoSize: v })} />
        </Row>
        <Row label="Brand bar">
          <Segmented label="Brand bar" value={s.bar} options={OPTIONS.bar} onChange={(v) => set({ bar: v })} />
        </Row>
        {s.bar !== "none" && (
          <Row label="Bar thickness">
            <NumberField label="Bar thickness" value={s.barWidth} onChange={(v) => set({ barWidth: v })} limits={LIMITS.barWidth} step={1} unit="px" />
          </Row>
        )}
      </Group>
      <Group title="Table" open>
        <Row label="Head fill">
          <Segmented label="Table head fill" value={s.headFill} options={OPTIONS.headFill} onChange={(v) => set({ headFill: v })} />
        </Row>
        <Row label="Head text">
          <ColorField label="Table head text" value={s.headText} onChange={(v) => set({ headText: v })} auto="Automatic" fallback={s.headFill === "accent" || s.headFill === "dark" ? "#ffffff" : s.text} />
        </Row>
        <Row label="Lines">
          <Segmented label="Table lines" value={s.rowLines} options={OPTIONS.rowLines} onChange={(v) => set({ rowLines: v })} />
        </Row>
        <Row label="Line colour">
          <ColorField label="Line colour" value={s.lineColor} onChange={(v) => set({ lineColor: v })} fallback="#e5e5e5" />
        </Row>
        <Row label="Line stroke">
          <NumberField label="Line stroke" value={s.lineWidth} onChange={(v) => set({ lineWidth: v })} limits={LIMITS.lineWidth} step={0.5} unit="px" />
        </Row>
        <Row label="Line style">
          <Segmented label="Line style" value={s.lineStyle} options={OPTIONS.lineStyle} onChange={(v) => set({ lineStyle: v })} />
        </Row>
        <Row label="Row height">
          <Segmented label="Row height" value={s.rowHeight} options={OPTIONS.rowHeight} onChange={(v) => set({ rowHeight: v })} />
        </Row>
        <Row label="Corners">
          <NumberField label="Corner radius" value={s.radius} onChange={(v) => set({ radius: v })} limits={LIMITS.radius} step={1} unit="px" />
        </Row>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          <Check label="Zebra rows" checked={s.zebra} onChange={(v) => set({ zebra: v })} />
          <Check label="Border round table" checked={s.tableBorder} onChange={(v) => set({ tableBorder: v })} />
        </div>
      </Group>
      <Group title="Panels and total">
        <Row label="Customer panel">
          <Segmented label="Customer panel" value={s.panel} options={OPTIONS.panel} onChange={(v) => set({ panel: v })} />
        </Row>
        <Row label="Total">
          <Segmented label="Total" value={s.total} options={OPTIONS.total} onChange={(v) => set({ total: v })} />
        </Row>
      </Group>
      <Group title="Show on the document">
        <div className="grid gap-2">
          <Check label="Line numbers (#)" checked={s.showNumbers} onChange={(v) => set({ showNumbers: v })} />
          <Check label="Amount in words" checked={s.showWords} onChange={(v) => set({ showWords: v })} />
          <Check label="Prepared by" checked={s.showPreparedBy} onChange={(v) => set({ showPreparedBy: v })} />
          <Check label="Signature and stamp (from Letterhead)" checked={s.showSignature} onChange={(v) => set({ showSignature: v })} />
        </div>
        <div className="grid gap-1.5">
          <span className="text-xs text-muted-foreground">Footer line (empty = each document&apos;s own)</span>
          <Input value={s.footerText} maxLength={160} onChange={(e) => set({ footerText: e.target.value })} placeholder="Thank you for your business." />
        </div>
      </Group>
    </div>
  );
}

/**
 * The Templates page: pick Classic, Bold or Minimal, change any detail, and watch an A4 preview redraw. One style for
 * every customer document; "Style quotations differently" gives the quotation its own.
 */
export function DocTemplateEditor({ initial, brand }: { initial: DocStyles; brand: QuoteBrand }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [styles, setStyles] = useState<DocStyles>(initial);
  const [editing, setEditing] = useState<"all" | "quote">("all");
  const [preview, setPreview] = useState<"invoice" | "quote">("invoice");
  const target = editing === "quote" && styles.quote ? "quote" : "all";
  const s = styles[target] ?? styles.all;
  const set = (p: Partial<DocStyle>) => setStyles((cur) => ({ ...cur, [target]: { ...(cur[target] ?? cur.all), ...p } }));
  const pick = (preset: Preset) => set({ ...PRESETS[preset], accent: s.accent });
  const dirty = JSON.stringify(styles) !== JSON.stringify(initial);

  const shownKind = target === "quote" ? "quote" : preview;
  const shownStyle = shownKind === "quote" && styles.quote ? styles.quote : styles.all;
  const docBrand = useMemo(() => ({ ...brand, style: withAccent(shownStyle, brand.color), color: withAccent(shownStyle, brand.color).accent }), [brand, shownStyle]);

  const save = () =>
    start(async () => {
      try {
        await saveDocStyles(styles);
        toast.success("Document style saved");
        router.refresh();
      } catch (e) {
        toast.error(errorText(e));
      }
    });

  return (
    <div className="grid min-w-0 gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="grid gap-0.5">
          <h1 className="text-sm font-semibold">Document templates</h1>
          <p className="text-xs text-muted-foreground">How quotations, invoices, delivery notes, credit notes and receipts look on paper and in PDFs. Documents already issued print in the new style too; their numbers never change.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={!dirty || pending} onClick={() => setStyles(initial)}>
            <RotateCcw /> Undo changes
          </Button>
          <Button size="sm" pending={pending} disabled={!dirty} onClick={save}>
            <Save /> Save
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card px-3 py-2">
        <Check
          label="Style quotations differently"
          checked={!!styles.quote}
          onChange={(on) => {
            setStyles((cur) => ({ ...cur, quote: on ? { ...cur.all } : null }));
            setEditing(on ? "quote" : "all");
          }}
        />
        {styles.quote && <Segmented label="Editing" value={editing} options={[["all", "All documents"], ["quote", "Quotations"]] as const} onChange={setEditing} />}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {PRESETS_LIST.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => pick(p)}
            aria-pressed={s.preset === p}
            className={`grid gap-1 rounded-lg border bg-card p-2 text-left transition-colors hover:border-primary/60 ${s.preset === p ? "border-primary ring-2 ring-primary/30" : ""}`}
          >
            <div className="pointer-events-none h-28 overflow-hidden rounded border bg-white" aria-hidden>
              <FitWidth>
                <QuoteDocument q={SAMPLE_QUOTE} brand={{ ...brand, style: withAccent(PRESETS[p], s.accent || brand.color) }} />
              </FitWidth>
            </div>
            <span className="text-sm font-medium">{PRESET_LABELS[p].label}</span>
            <span className="hidden text-xs text-muted-foreground sm:block">{PRESET_LABELS[p].hint}</span>
          </button>
        ))}
      </div>

      <div className="grid min-w-0 items-start gap-3 lg:grid-cols-[21rem_minmax(0,1fr)]">
        <div className="grid gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              Based on <strong className="text-foreground">{PRESET_LABELS[s.preset].label}</strong>
            </span>
            <Button variant="ghost" size="xs" onClick={() => pick(s.preset)}>
              <RotateCcw /> Reset to {PRESET_LABELS[s.preset].label}
            </Button>
          </div>
          <StyleControls s={s} set={set} brandColor={brand.color} />
        </div>
        <div className="grid min-w-0 gap-2 lg:sticky lg:top-3">
          {target === "all" && (
            <Segmented
              label="Preview"
              value={preview}
              options={[["invoice", "Tax invoice"], ["quote", "Quotation"]] as const}
              onChange={setPreview}
            />
          )}
          <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
            <FitWidth>{shownKind === "quote" ? <QuoteDocument q={SAMPLE_QUOTE} brand={docBrand} /> : <SalesDocument d={SAMPLE_INVOICE} brand={docBrand} />}</FitWidth>
          </div>
        </div>
      </div>
    </div>
  );
}
