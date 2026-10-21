"use client";

import { useState } from "react";
import { Bar, BarChart, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { aedShort } from "@/lib/sales";
import { DataTable, TipBox, ViewSwitch } from "./chart-bits";

export interface BarRow {
  label: string;
  value: number;
  /** Shown second in the tooltip, e.g. "3 won (25%)". */
  note?: string;
}

export interface BarView {
  key: string;
  /** Tab text. */
  label: string;
  data: BarRow[];
  format: "count" | "aed";
  /** Name of the value, for the tooltip and the table ("deals", "AED"). */
  unit: string;
  empty: string;
}

const fmt = (n: number, f: "count" | "aed") => (f === "aed" ? aedShort(n) : n.toLocaleString("en-US"));

/**
 * Horizontal bars for one or more datasets (switch with the tabs). One colour, since the bars are one measure.
 * Bars are thin with a rounded tip, the value sits at the tip, and the same data is available as a table.
 */
export function HBarPanel({ title, hint, views, color = "var(--series-1)" }: { title: string; hint?: string; views: BarView[]; color?: string }) {
  const [active, setActive] = useState(views[0].key);
  const [table, setTable] = useState(false);
  const view = views.find((v) => v.key === active) ?? views[0];
  const longest = Math.max(...view.data.map((d) => d.label.length), 4);
  const labelWidth = Math.min(170, longest * 6.6 + 12);

  return (
    <section className="flex h-full flex-col rounded-xl border bg-card">
      <header className="flex flex-wrap items-center gap-2 px-4 pt-3">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-medium">{title}</h2>
          {hint && <p className="truncate text-xs text-muted-foreground">{hint}</p>}
        </div>
        {views.length > 1 && (
          <div className="inline-flex rounded-lg border bg-muted/50 p-0.5" role="tablist">
            {views.map((v) => (
              <button
                key={v.key}
                type="button"
                role="tab"
                aria-selected={v.key === view.key}
                onClick={() => setActive(v.key)}
                className={`h-6 rounded-md px-2 text-xs font-medium ${v.key === view.key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                {v.label}
              </button>
            ))}
          </div>
        )}
        <ViewSwitch table={table} onChange={setTable} />
      </header>
      <div className="flex min-h-0 flex-1 flex-col px-3 pt-2 pb-3">
        {!view.data.length ? (
          <p className="grid h-32 place-content-center text-sm text-muted-foreground">{view.empty}</p>
        ) : table ? (
          <DataTable head={[title, view.unit]} rows={view.data.map((d) => [d.label, fmt(d.value, view.format)])} />
        ) : (
          <div className="h-full" style={{ minHeight: view.data.length * 30 + 12 }} role="img" aria-label={`${title}: ${view.data.map((d) => `${d.label} ${fmt(d.value, view.format)}`).join(", ")}`}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={view.data} layout="vertical" margin={{ top: 2, right: 56, bottom: 2, left: 0 }} barCategoryGap={6}>
                <XAxis type="number" hide domain={[0, (max: number) => Math.max(1, Math.ceil(max * 1.15))]} />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={labelWidth}
                  tickLine={false}
                  axisLine={false}
                  interval={0}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                />
                <Tooltip
                  cursor={{ fill: "var(--muted)", opacity: 0.5 }}
                  content={({ active: on, payload }) => {
                    const row = payload?.[0]?.payload as BarRow | undefined;
                    if (!on || !row) return null;
                    return (
                      <TipBox
                        title={row.label}
                        rows={[{ color, value: fmt(row.value, view.format), label: view.unit }, ...(row.note ? [{ value: row.note, label: "" }] : [])]}
                      />
                    );
                  }}
                />
                <Bar dataKey="value" fill={color} barSize={18} radius={[0, 4, 4, 0]} activeBar={{ fillOpacity: 0.75 }} isAnimationActive={false}>
                  <LabelList dataKey="value" position="right" formatter={(v) => fmt(Number(v), view.format)} style={{ fill: "var(--foreground)", fontSize: 12, fontWeight: 600 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </section>
  );
}
