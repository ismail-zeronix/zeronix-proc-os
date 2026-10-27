"use client";

import { ChartColumn, Table2 } from "lucide-react";

/** A tooltip body: values lead, names follow, each row keyed by a short line of its series colour. */
export function TipBox({ title, rows }: { title?: string; rows: { color?: string; value: string; label: string }[] }) {
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      {title && <div className="mb-1 font-medium">{title}</div>}
      <div className="grid gap-0.5">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-2">
            {r.color && <span className="h-0.5 w-3 shrink-0 rounded-full" style={{ background: r.color }} />}
            <span className="text-sm font-semibold tabular-nums">{r.value}</span>
            <span className="text-muted-foreground">{r.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** The small chart / table switch in a chart card's corner. Every chart can be read as a table. */
export function ViewSwitch({ table, onChange }: { table: boolean; onChange: (table: boolean) => void }) {
  const btn = (active: boolean) =>
    `inline-flex size-6 items-center justify-center rounded-md transition-colors [&_svg]:size-3.5 ${active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`;
  return (
    <div className="inline-flex shrink-0 rounded-lg border bg-muted/50 p-0.5" role="group" aria-label="Show as">
      <button type="button" className={btn(!table)} onClick={() => onChange(false)} aria-pressed={!table} title="Chart" aria-label="Show as chart">
        <ChartColumn />
      </button>
      <button type="button" className={btn(table)} onClick={() => onChange(true)} aria-pressed={table} title="Table" aria-label="Show as table">
        <Table2 />
      </button>
    </div>
  );
}

/** Hairline table used for the "show as table" view of a chart. */
export function DataTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <div className="max-h-64 overflow-auto rounded-lg border">
      <table className="w-full text-xs">
        <thead className="bg-muted/50 text-muted-foreground">
          <tr>
            {head.map((h, i) => (
              <th key={h} className={`px-3 py-1.5 font-medium ${i === 0 ? "text-left" : "text-right"}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} className="border-t">
              {r.map((c, ci) => (
                <td key={ci} className={`px-3 py-1.5 ${ci === 0 ? "text-left" : "text-right tabular-nums"}`}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
