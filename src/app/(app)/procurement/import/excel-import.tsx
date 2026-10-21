"use client";

import { AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CURRENCIES } from "@/lib/currency";
import { CATEGORIES } from "@/lib/llm/schema";
import type { WorkbookResult } from "@/lib/parse/excel";
import { SUPPLIER_TYPES, supplierType } from "@/lib/supplier-types";
import { cn } from "@/lib/utils";
import { createExcelPriceList } from "./actions";

const NEW = "__new__";

interface Preview extends WorkbookResult {
  fileName: string;
  modified: string | null;
  hiddenSheets: string[];
}

export interface SupplierOption {
  id: number;
  name: string;
  type: string;
  defaultCurrency: string;
}

const localInput = (iso: string | null) => {
  const d = iso ? new Date(iso) : new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

export function ExcelImport({ suppliers, fxUsd }: { suppliers: SupplierOption[]; fxUsd: number }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [pending, start] = useTransition();

  const [supplierId, setSupplierId] = useState("");
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("distributor");
  const [currency, setCurrency] = useState<string>("USD");
  const [basis, setBasis] = useState("");
  const [receivedAt, setReceivedAt] = useState("");
  const [sheets, setSheets] = useState<{ include: boolean; category: string }[]>([]);
  const [open, setOpen] = useState<string | null>(null);

  async function upload(file: File | undefined) {
    if (!file) return;
    setError("");
    setLoading(true);
    setPreview(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/import/excel", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Upload failed (${res.status})`);
      const p = data as Preview;
      setPreview(p);
      setBasis(p.basis);
      setReceivedAt(localInput(p.modified));
      setCurrency(p.currencyHint || "USD");
      setSheets(p.sheets.map((s) => ({ include: s.drafts.length > 0, category: s.category })));
      setOpen(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function chooseSupplier(v: string) {
    setSupplierId(v);
    const s = suppliers.find((x) => String(x.id) === v);
    // the supplier's usual currency, unless the sheet itself states one
    if (s && !preview?.currencyHint) setCurrency(s.defaultCurrency);
  }

  const chosen = suppliers.find((s) => String(s.id) === supplierId);
  const included = preview?.sheets.filter((_, i) => sheets[i]?.include) ?? [];
  const rows = included.reduce((n, s) => n + s.drafts.length, 0);
  const priced = included.reduce((n, s) => n + s.drafts.filter((d) => d.price != null).length, 0);
  const flagged = included.reduce((n, s) => n + s.drafts.filter((d) => d.flags.length).length, 0);
  const supplierOk = supplierId && (supplierId !== NEW || newName.trim().length >= 2);
  const sample = preview?.sheets.flatMap((s) => s.drafts).find((d) => d.price != null);

  const submit = () => {
    if (!preview) return;
    start(async () => {
      try {
        const res = await createExcelPriceList({
          supplierId: supplierId && supplierId !== NEW ? Number(supplierId) : undefined,
          newSupplierName: supplierId === NEW ? newName : undefined,
          newSupplierType: newType,
          receivedAt: receivedAt || undefined,
          currency: currency as (typeof CURRENCIES)[number],
          basis,
          fileName: preview.fileName,
          sheets: preview.sheets.flatMap((s, i) =>
            sheets[i]?.include && s.drafts.length
              ? [{ name: s.name, category: sheets[i].category as (typeof CATEGORIES)[number], drafts: s.drafts }]
              : [],
          ),
        });
        toast.success(`${res.rows} rows read. Check them, then save.`);
        router.push(`/procurement/import/${res.id}`);
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  };

  if (!preview) {
    return (
      <Card>
        <CardContent className="grid gap-4">
          <div
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes("Files")) {
                e.preventDefault();
                setDragging(true);
              }
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              void upload(e.dataTransfer.files[0]);
            }}
            className={cn(
              "grid justify-items-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors",
              dragging ? "border-primary bg-primary/5" : "border-border",
            )}
          >
            {loading ? <Loader2 className="size-8 animate-spin text-muted-foreground" /> : <FileSpreadsheet className="size-8 text-muted-foreground" />}
            <div>
              <p className="font-medium">{loading ? "Reading the workbook…" : "Drop the distributor's Excel price list here"}</p>
              <p className="text-sm text-muted-foreground">
                .xlsx with one sheet per category (laptops, desktops, monitors…). Each sheet is read by rules, no AI wait.
              </p>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="sr-only"
              tabIndex={-1}
              onChange={(e) => {
                void upload(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <Button onClick={() => fileRef.current?.click()} disabled={loading}>
              <Upload /> Choose Excel file
            </Button>
          </div>
          {error && (
            <p role="alert" className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {error}
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-3">
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <FileSpreadsheet className="size-4" /> {preview.fileName}
            <Button variant="ghost" size="sm" onClick={() => setPreview(null)}>
              Choose a different file
            </Button>
          </CardTitle>
          <CardDescription>
            {preview.sheets.length} sheet{preview.sheets.length === 1 ? "" : "s"} · {rows} rows selected · {priced} with a price
            {flagged ? ` · ${flagged} to check` : ""}
            {preview.hiddenSheets.length ? ` · hidden sheets skipped: ${preview.hiddenSheets.join(", ")}` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="grid gap-1.5">
              <Label htmlFor="x-supplier">Supplier</Label>
              <NativeSelect id="x-supplier" value={supplierId} onChange={(e) => chooseSupplier(e.target.value)}>
                <NativeSelectOption value="">Choose supplier…</NativeSelectOption>
                {suppliers.map((s) => (
                  <NativeSelectOption key={s.id} value={String(s.id)}>
                    {s.name} ({supplierType(s.type).short})
                  </NativeSelectOption>
                ))}
                <NativeSelectOption value={NEW}>+ New supplier</NativeSelectOption>
              </NativeSelect>
            </div>
            {supplierId === NEW && (
              <>
                <div className="grid gap-1.5">
                  <Label htmlFor="x-name">New supplier name</Label>
                  <Input id="x-name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Mitsumi Distribution" />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="x-type">Category</Label>
                  <NativeSelect
                    id="x-type"
                    value={newType}
                    onChange={(e) => {
                      setNewType(e.target.value);
                      if (!preview.currencyHint) setCurrency(supplierType(e.target.value).currency);
                      if (!preview.basis && !basis) setBasis(supplierType(e.target.value).basis);
                    }}
                  >
                    {SUPPLIER_TYPES.map((t) => (
                      <NativeSelectOption key={t.key} value={t.key}>
                        {t.label}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </div>
              </>
            )}
            <div className="grid gap-1.5">
              <Label htmlFor="x-cur">Prices are in</Label>
              <NativeSelect id="x-cur" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {CURRENCIES.map((c) => (
                  <NativeSelectOption key={c} value={c}>
                    {c}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="x-basis">Price basis</Label>
              <Input id="x-basis" value={basis} onChange={(e) => setBasis(e.target.value)} placeholder="FOB JA, ex-VAT… (optional)" maxLength={40} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="x-date">Price list date</Label>
              <Input id="x-date" type="datetime-local" value={receivedAt} onChange={(e) => setReceivedAt(e.target.value)} />
            </div>
          </div>

          <div className="grid gap-1 text-sm">
            {!preview.currencyHint && (
              <p className="flex items-start gap-2 rounded-md bg-amber-500/10 px-3 py-2 text-amber-900 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <span>
                  The sheet does not say which currency it uses
                  {preview.basis ? ` (the price column is “${preview.basis}”)` : ""}. Distributor FOB prices are usually USD.
                  Confirm it above, it decides how these prices rank against AED quotes.
                  {sample && currency === "USD" && (
                    <>
                      {" "}Example: {sample.price?.toLocaleString("en-US")} USD is about AED{" "}
                      {Math.round((sample.price ?? 0) * fxUsd).toLocaleString("en-US")} at {fxUsd}.
                    </>
                  )}
                </span>
              </p>
            )}
            {chosen && chosen.defaultCurrency !== currency && (
              <p className="text-xs text-muted-foreground">
                {chosen.name} normally quotes in {chosen.defaultCurrency}. Importing in {currency} will update that.
              </p>
            )}
            {basis && (
              <p className="text-xs text-muted-foreground">
                “{basis}” is shown next to every price from this sheet, so nobody mistakes it for a delivered price including VAT.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sheets found</CardTitle>
          <CardDescription>Untick a sheet to leave it out. The category applies to every row of that sheet.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Sheet</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Rows</TableHead>
                <TableHead className="text-right">With price</TableHead>
                <TableHead>Read from</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {preview.sheets.map((s, i) => {
                const st = sheets[i];
                if (!st) return null;
                const p = s.drafts.filter((d) => d.price != null).length;
                return (
                  <SheetRows key={s.name + i} open={open === s.name} onToggle={() => setOpen(open === s.name ? null : s.name)} sheet={s}>
                    <TableCell>
                      <Checkbox
                        checked={st.include}
                        disabled={!s.drafts.length}
                        onCheckedChange={(c) => setSheets(sheets.map((x, j) => (j === i ? { ...x, include: !!c } : x)))}
                        aria-label={`Include sheet ${s.name}`}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell>
                      <NativeSelect
                        size="sm"
                        value={st.category}
                        onChange={(e) => setSheets(sheets.map((x, j) => (j === i ? { ...x, category: e.target.value } : x)))}
                        aria-label={`Category of ${s.name}`}
                      >
                        {CATEGORIES.map((c) => (
                          <NativeSelectOption key={c} value={c}>
                            {c}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{s.drafts.length}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {p}
                      {s.drafts.length - p > 0 && <span className="ml-1 text-xs text-muted-foreground">({s.drafts.length - p} none)</span>}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {s.headerRow ? `header on row ${s.headerRow}` : "guessed from the data"}
                      {s.warnings.map((w) => (
                        <span key={w} className="mt-0.5 flex items-start gap-1 text-amber-700 dark:text-amber-300">
                          <AlertTriangle className="mt-0.5 size-3 shrink-0" /> {w}
                        </span>
                      ))}
                    </TableCell>
                  </SheetRows>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {supplierOk ? (
            <span className="inline-flex items-center gap-1">
              <CheckCircle2 className="size-4 text-emerald-600" /> Next you review the rows, then save. Nothing is on Compare until you do.
            </span>
          ) : (
            "Choose the supplier to continue."
          )}
        </p>
        <Button onClick={submit} disabled={pending || !supplierOk || !rows}>
          {pending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
          {pending ? "Preparing…" : `Review ${rows} rows`}
        </Button>
      </div>
    </div>
  );
}

/** A sheet row plus an expandable sample of what was read from it. */
function SheetRows({
  sheet,
  open,
  onToggle,
  children,
}: {
  sheet: Preview["sheets"][number];
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <>
      <TableRow className="cursor-pointer" onClick={(e) => !(e.target as HTMLElement).closest("input,select,button,label") && onToggle()}>
        {children}
      </TableRow>
      {open && (
        <TableRow className="bg-muted/30 hover:bg-muted/30">
          <TableCell colSpan={6} className="p-3">
            <p className="mb-2 text-xs text-muted-foreground">
              Columns: part number “{sheet.columns.pn}”, description “{sheet.columns.desc}”, price “{sheet.columns.price || "none"}”, stock “
              {sheet.columns.stock || "none"}”. First rows as the app will see them:
            </p>
            <div className="overflow-x-auto rounded-md border bg-background">
              <table className="w-full text-xs">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    {["Part no.", "Model", "CPU", "RAM", "Storage", "Display", "OS", "Extras", "Price", "Stock"].map((h) => (
                      <th key={h} className="px-2 py-1 font-medium">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sheet.drafts.slice(0, 5).map((d) => (
                    <tr key={d.key} className="border-t">
                      <td className="px-2 py-1 font-mono">{d.partNumber}</td>
                      <td className="px-2 py-1">{d.modelName}</td>
                      <td className="px-2 py-1">{d.cpu}</td>
                      <td className="px-2 py-1">{d.ramGb ?? ""}</td>
                      <td className="px-2 py-1">{d.storage}</td>
                      <td className="px-2 py-1">{d.display}</td>
                      <td className="px-2 py-1">{d.os}</td>
                      <td className="px-2 py-1">{d.extras}</td>
                      <td className="px-2 py-1 text-right font-medium tabular-nums">{d.price ?? "—"}</td>
                      <td className="px-2 py-1">{d.stockNote}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {sheet.skipped.length > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                <Badge variant="outline" className="mr-1">
                  {sheet.skipped.length} skipped
                </Badge>
                {sheet.skipped.slice(0, 4).map((s) => `row ${s.row}: ${s.reason}`).join(" · ")}
              </p>
            )}
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
