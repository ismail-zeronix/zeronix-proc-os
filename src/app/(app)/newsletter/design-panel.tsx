"use client";

import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { FONTS, THEMES } from "@/lib/newsletter/blocks";
import type { FontKey, NewsStyle } from "@/lib/newsletter/types";

function Colour({ label, value, onChange, hint }: { label: string; value: string; onChange: (v: string) => void; hint?: string }) {
  return (
    <div className="grid gap-1">
      <Label className="text-xs">{label}</Label>
      <div className="flex items-center gap-2">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value.toUpperCase())} aria-label={label} className="h-8 w-12 cursor-pointer rounded border bg-transparent p-0.5" />
        <span className="font-mono text-xs text-muted-foreground">{value}</span>
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Fonts, colours and the look of the whole newsletter. Every colour combination keeps readable text on buttons and bands. */
export function DesignPanel({ style, onChange }: { style: NewsStyle; onChange: (s: NewsStyle) => void }) {
  const set = (p: Partial<NewsStyle>) => onChange({ ...style, ...p });
  const fonts = Object.entries(FONTS) as [FontKey, { label: string }][];
  return (
    <div className="grid gap-4">
      <section className="grid gap-2 rounded-xl border bg-card p-3">
        <Label className="text-xs">Colour themes</Label>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {THEMES.map((t) => {
            const on = t.brand.toLowerCase() === style.brand.toLowerCase() && t.accent.toLowerCase() === style.accent.toLowerCase();
            return (
              <button
                key={t.key}
                type="button"
                aria-pressed={on}
                onClick={() => set({ brand: t.brand, accent: t.accent, page: t.page })}
                className={`flex items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs hover:bg-muted ${on ? "border-foreground" : ""}`}
              >
                <span className="flex overflow-hidden rounded border">
                  <span className="size-5" style={{ background: t.brand }} />
                  <span className="size-5" style={{ background: t.accent }} />
                  <span className="size-5" style={{ background: t.page }} />
                </span>
                {t.label}
              </button>
            );
          })}
        </div>
      </section>

      <section className="grid gap-3 rounded-xl border bg-card p-3">
        <div className="grid grid-cols-3 gap-3">
          <Colour label="Main (dark)" value={style.brand} onChange={(v) => set({ brand: v })} />
          <Colour label="Accent" value={style.accent} onChange={(v) => set({ accent: v })} />
          <Colour label="Background" value={style.page} onChange={(v) => set({ page: v })} />
        </div>
        <p className="text-xs text-muted-foreground">Pick a dark main colour: the header, banner and footer use it, and the white logo sits on it. Button and band text turns light or dark by itself so it stays readable.</p>
      </section>

      <section className="grid gap-3 rounded-xl border bg-card p-3">
        <div className="grid gap-1">
          <Label htmlFor="ds-hf" className="text-xs">
            Heading font
          </Label>
          <NativeSelect className="w-full" id="ds-hf" value={style.headingFont} onChange={(e) => set({ headingFont: e.target.value as FontKey })}>
            {fonts.map(([k, f]) => (
              <NativeSelectOption key={k} value={k}>
                {f.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <div className="grid gap-1">
          <Label htmlFor="ds-bf" className="text-xs">
            Text font
          </Label>
          <NativeSelect className="w-full" id="ds-bf" value={style.bodyFont} onChange={(e) => set({ bodyFont: e.target.value as FontKey })}>
            {fonts.map(([k, f]) => (
              <NativeSelectOption key={k} value={k}>
                {f.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <p className="text-xs text-muted-foreground">Only fonts that every mail app has, so the email looks the same for everyone (a custom font would be replaced by a default in most inboxes).</p>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={style.round} onChange={(e) => set({ round: e.target.checked })} /> Rounded corners
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={style.logo} onChange={(e) => set({ logo: e.target.checked })} /> Show the logo bar at the top
        </label>
      </section>
    </div>
  );
}
