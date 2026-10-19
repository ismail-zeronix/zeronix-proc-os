"use client";

import { createColumnHelper, tableFeatures, useTable } from "@tanstack/react-table";
import { AlertTriangle, Link2, Plus, Undo2 } from "lucide-react";
import { memo, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CATEGORIES, type OfferDraft } from "@/lib/llm/schema";
import { cn } from "@/lib/utils";
import { useReviewStore } from "@/stores/import-store";

const features = tableFeatures({ columnMeta: {} as { width?: string } });
const col = createColumnHelper<typeof features, OfferDraft>();

type TextField = "brand" | "modelName" | "partNumber" | "cpu" | "storage" | "display" | "gpu" | "os" | "extras" | "currency" | "priceBasis";

/** Text input that commits on blur / Enter so typing does not re-render the whole grid. */
const Cell = memo(function Cell({
  value,
  onCommit,
  readOnly,
  className,
  type = "text",
  placeholder,
}: {
  value: string;
  onCommit: (v: string) => void;
  readOnly?: boolean;
  className?: string;
  type?: "text" | "number";
  placeholder?: string;
}) {
  if (readOnly) return <span className={cn("block truncate px-1 text-sm", className)}>{value || "—"}</span>;
  return (
    <input
      // uncontrolled + keyed by value: resets when the store changes, commits on blur
      key={value}
      defaultValue={value}
      type={type}
      placeholder={placeholder}
      onBlur={(e) => e.target.value !== value && onCommit(e.target.value)}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      className={cn(
        "h-8 w-full min-w-0 rounded-md border border-transparent bg-transparent px-1.5 text-sm outline-none hover:border-input focus:border-ring focus:bg-background",
        className,
      )}
    />
  );
});

export function ReviewGrid({
  id,
  rows,
  readOnly,
  actions,
  onReset,
}: {
  id: number;
  rows: OfferDraft[];
  readOnly?: boolean;
  actions?: React.ReactNode;
  onReset?: () => void;
}) {
  const update = useReviewStore((s) => s.update);
  const updateMany = useReviewStore((s) => s.updateMany);
  const [onlyFlagged, setOnlyFlagged] = useState(false);

  const columns = useMemo(() => {
    const text = (field: TextField, header: string, width: string) =>
      col.display({
      id: field,
      header,
      meta: { width },
      cell: ({ row }) => (
        <Cell readOnly={readOnly} value={row.original[field]} onCommit={(v) => update(id, row.original.key, { [field]: v })} />
      ),
    });
    return col.columns([
      col.display({
        id: "include",
        header: () =>
          readOnly ? null : (
            <Checkbox
              checked={rows.length > 0 && rows.every((r) => r.include)}
              onCheckedChange={(c) => updateMany(id, rows.map((r) => r.key), { include: !!c })}
              aria-label="Include all"
            />
          ),
        meta: { width: "w-8" },
        cell: ({ row }) =>
          readOnly ? null : (
            <Checkbox
              checked={row.original.include}
              onCheckedChange={(c) => update(id, row.original.key, { include: !!c })}
              aria-label="Include row"
            />
          ),
      }),
      col.display({
        id: "flags",
        header: "",
        meta: { width: "w-8" },
        cell: ({ row }) => {
          const d = row.original;
          return (
            <Tooltip>
              <TooltipTrigger
                render={
                  <span
                    className={cn(
                      "flex size-6 items-center justify-center rounded-full text-[10px] font-semibold",
                      d.flags.length ? "bg-amber-500/15 text-amber-600" : "bg-muted text-muted-foreground",
                    )}
                  />
                }
              >
                {d.flags.length ? <AlertTriangle className="size-3.5" /> : Math.round(d.confidence * 100)}
              </TooltipTrigger>
              <TooltipContent className="max-w-sm">
                {d.flags.length > 0 && (
                  <ul className="mb-2 list-disc pl-4">
                    {d.flags.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                )}
                <pre className="font-mono text-xs whitespace-pre-wrap">{d.rawText}</pre>
              </TooltipContent>
            </Tooltip>
          );
        },
      }),
      col.display({
        id: "category",
        header: "Category",
        meta: { width: "w-32" },
        cell: ({ row }) =>
          readOnly ? (
            <span className="px-1 text-sm">{row.original.category}</span>
          ) : (
            <NativeSelect
              size="sm"
              value={row.original.category}
              onChange={(e) => update(id, row.original.key, { category: e.target.value as OfferDraft["category"] })}
            >
              {CATEGORIES.map((c) => (
                <NativeSelectOption key={c} value={c}>
                  {c}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          ),
      }),
      text("brand", "Brand", "w-24"),
      text("modelName", "Model", "w-48"),
      text("partNumber", "Part no.", "w-32"),
      text("cpu", "CPU", "w-44"),
      col.display({
        id: "ramGb",
        header: "RAM GB",
        meta: { width: "w-20" },
        cell: ({ row }) => (
          <Cell
            readOnly={readOnly}
            type="number"
            value={row.original.ramGb == null ? "" : String(row.original.ramGb)}
            onCommit={(v) => update(id, row.original.key, { ramGb: v === "" ? null : Math.round(Number(v)) || null })}
          />
        ),
      }),
      text("storage", "Storage", "w-28"),
      text("display", "Display", "w-32"),
      text("os", "OS", "w-28"),
      text("extras", "Extras", "w-40"),
      col.display({
        id: "price",
        header: "Price",
        meta: { width: "w-24" },
        cell: ({ row }) => (
          <Cell
            readOnly={readOnly}
            type="number"
            placeholder="no price"
            className="text-right font-medium tabular-nums"
            value={row.original.price == null ? "" : String(row.original.price)}
            onCommit={(v) => update(id, row.original.key, { price: v === "" ? null : Number(v) || null })}
          />
        ),
      }),
      text("currency", "Cur.", "w-16"),
      text("priceBasis", "Basis", "w-24"),
      col.display({
        id: "product",
        header: "Product match",
        meta: { width: "w-56" },
        cell: ({ row }) => {
          const d = row.original;
          if (d.productId) {
            return (
              <div className="flex items-center gap-1">
                <Badge variant="secondary" className="max-w-[180px] truncate" title={d.productLabel}>
                  <Link2 className="size-3" /> {d.productLabel || `#${d.productId}`}
                </Badge>
                {!readOnly && (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    title="Create as new product instead"
                    onClick={() => update(id, d.key, { productId: null, productLabel: "" })}
                  >
                    <Undo2 />
                  </Button>
                )}
              </div>
            );
          }
          if (d.suggestedProductId && !readOnly) {
            return (
              <Button
                variant="outline"
                size="xs"
                className="max-w-[220px] justify-start truncate"
                title={`Same product as: ${d.suggestedLabel}?`}
                onClick={() => update(id, d.key, { productId: d.suggestedProductId, productLabel: d.suggestedLabel })}
              >
                <Link2 /> <span className="truncate">Same as {d.suggestedLabel}?</span>
              </Button>
            );
          }
          return (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Plus className="size-3" /> new product
            </span>
          );
        },
      }),
    ]);
  }, [id, readOnly, rows, update, updateMany]);

  const data = useMemo(() => (onlyFlagged ? rows.filter((r) => r.flags.length > 0) : rows), [rows, onlyFlagged]);
  const table = useTable({ features, data, columns, getRowId: (r) => r.key });

  const flagged = rows.filter((r) => r.flags.length).length;
  const noPrice = rows.filter((r) => r.include && r.price == null).length;

  return (
    <Card>
      <CardContent className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{rows.length} rows</Badge>
          {flagged > 0 && (
            <Button variant={onlyFlagged ? "secondary" : "ghost"} size="sm" onClick={() => setOnlyFlagged((v) => !v)}>
              <AlertTriangle className="text-amber-600" /> {flagged} to check
            </Button>
          )}
          {noPrice > 0 && <Badge variant="outline">{noPrice} without price</Badge>}
          {!readOnly && noPrice > 0 && (
            <Button
              variant="ghost"
              size="sm"
              title="Untick every row that has no price"
              onClick={() =>
                updateMany(
                  id,
                  rows.filter((r) => r.price == null).map((r) => r.key),
                  { include: false },
                )
              }
            >
              Skip rows without price
            </Button>
          )}
          {!readOnly && (
            <Button
              variant="ghost"
              size="sm"
              title="Link every “Same as …?” suggestion"
              disabled={!rows.some((r) => !r.productId && r.suggestedProductId)}
              onClick={() => {
                for (const r of rows) {
                  if (!r.productId && r.suggestedProductId) {
                    update(id, r.key, { productId: r.suggestedProductId, productLabel: r.suggestedLabel });
                  }
                }
              }}
            >
              <Link2 /> Accept all matches
            </Button>
          )}
          {!readOnly && onReset && (
            <Button variant="ghost" size="sm" onClick={() => confirm("Discard your edits?") && onReset()}>
              <Undo2 /> Reset edits
            </Button>
          )}
          <div className="flex-1" />
          {actions}
        </div>
        {/* the Table component wraps <table> in its own scroll box: give that box a height so the header can stick */}
        <div className="rounded-md border [&_[data-slot=table-container]]:max-h-[68vh] [&_[data-slot=table-container]]:overflow-auto">
          <Table className="min-w-[1600px] table-fixed">
            <TableHeader className="sticky top-0 z-10 bg-card shadow-[0_1px_0_var(--border)]">
              {table.getHeaderGroups().map((hg) => (
                <TableRow key={hg.id}>
                  {hg.headers.map((h) => (
                    <TableHead
                      key={h.id}
                      className={cn(h.column.columnDef.meta?.width, "px-1 text-xs")}
                    >
                      <table.FlexRender header={h} />
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.map((r) => (
                <TableRow
                  key={r.id}
                  className={cn(
                    !r.original.include && "opacity-45",
                    r.original.flags.length > 0 && r.original.include && "bg-amber-500/5",
                  )}
                >
                  {r.getAllCells().map((c) => (
                    <TableCell key={c.id} className="px-1 py-1">
                      <table.FlexRender cell={c} />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
              {!data.length && (
                <TableRow>
                  <TableCell colSpan={columns.length} className="py-10 text-center text-sm text-muted-foreground">
                    No products found in this message.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
