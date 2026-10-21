"use client";

import { useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { DataTable, TipBox, ViewSwitch } from "./chart-bits";

export interface TrendSeries {
  key: string;
  label: string;
  /** A CSS colour, normally one of the --series-N variables. */
  color: string;
}

type Point = { label: string } & Record<string, number | string>;

/**
 * Lines over time on ONE axis (never two). 2px lines, a hairline solid grid, a vertical crosshair with a tooltip
 * that lists every series, an end marker on the latest point, a legend, and the same data as a table.
 */
export function TrendPanel({ title, hint, points, series }: { title: string; hint?: string; points: Point[]; series: TrendSeries[] }) {
  const [table, setTable] = useState(false);
  const last = points.length - 1;
  return (
    <section className="flex h-full flex-col rounded-xl border bg-card">
      <header className="flex flex-wrap items-center gap-2 px-4 pt-3">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-medium">{title}</h2>
          {hint && <p className="truncate text-xs text-muted-foreground">{hint}</p>}
        </div>
        <ul className="flex items-center gap-3 text-xs text-muted-foreground">
          {series.map((s) => (
            <li key={s.key} className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded-full" style={{ background: s.color }} /> {s.label}
            </li>
          ))}
        </ul>
        <ViewSwitch table={table} onChange={setTable} />
      </header>
      <div className="flex-1 px-3 pt-2 pb-3">
        {table ? (
          <DataTable head={["Period", ...series.map((s) => s.label)]} rows={points.map((p) => [p.label, ...series.map((s) => Number(p[s.key]))])} />
        ) : (
          <div className="h-56" role="img" aria-label={`${title}. ${series.map((s) => `${s.label}: ${points.map((p) => p[s.key]).join(", ")}`).join(". ")}`}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={points} margin={{ top: 10, right: 14, bottom: 0, left: -12 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: "var(--border)" }} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} minTickGap={24} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={44} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} />
                <Tooltip
                  cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
                  content={({ active, payload, label }) =>
                    active && payload?.length ? (
                      <TipBox title={String(label)} rows={series.map((s) => ({ color: s.color, value: String(payload.find((p) => p.dataKey === s.key)?.value ?? 0), label: s.label }))} />
                    ) : null
                  }
                />
                {series.map((s) => (
                  <Line
                    key={s.key}
                    type="monotone"
                    dataKey={s.key}
                    stroke={s.color}
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    isAnimationActive={false}
                    activeDot={{ r: 5, stroke: "var(--card)", strokeWidth: 2, fill: s.color }}
                    dot={({ cx, cy, index }) =>
                      index === last ? (
                        <circle key={`${s.key}-end`} cx={cx} cy={cy} r={4} fill={s.color} stroke="var(--card)" strokeWidth={2} />
                      ) : (
                        <g key={`${s.key}-${index}`} />
                      )
                    }
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </section>
  );
}
