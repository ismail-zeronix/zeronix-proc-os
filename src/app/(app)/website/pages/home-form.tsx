"use client";

import { ExternalLink } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { SITE_ICONS, type SiteHome } from "@/lib/website/contract";
import { updateHome } from "../actions";

/** Pads a list to `n` rows so empty rows can be filled in; empty rows are dropped on save. */
const pad = <T,>(rows: T[], n: number, blank: T): T[] => [...rows, ...Array.from({ length: Math.max(0, n - rows.length) }, () => ({ ...blank }))];

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border bg-card">
      <div className="flex items-baseline gap-2 border-b px-3 py-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
      <div className="grid gap-3 p-3">{children}</div>
    </section>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

export function HomeForm({ home, tagline, siteUrl, canEdit }: { home: SiteHome; tagline: string; siteUrl: string; canEdit: boolean }) {
  const [f, setF] = useState<SiteHome>({
    ...home,
    features: pad(home.features, 3, { tag: "", title: "", text: "", href: "", image: "" }),
    stats: pad(home.stats, 4, { value: "", label: "" }),
    steps: pad(home.steps, 3, { title: "", text: "" }),
    reasons: pad(home.reasons, 4, { icon: "", title: "", text: "" }),
  });
  const [pending, start] = useTransition();

  const hero = (k: keyof SiteHome["hero"]) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, hero: { ...f.hero, [k]: e.target.value } });
  const row = <K extends "features" | "stats" | "steps" | "reasons">(list: K, i: number, k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF({ ...f, [list]: f[list].map((r, j) => (j === i ? { ...r, [k]: e.target.value } : r)) });

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const res = await updateHome(f);
      if (res.error !== undefined) return void toast.error(res.error);
      toast.success(res.value.siteRefreshed ? "Saved, the site is updated" : "Saved; the site picks it up within 10 minutes");
    });
  };

  return (
    <form onSubmit={save} className="grid gap-3">
      <fieldset disabled={!canEdit} className="grid gap-3">
        <Section title="Hero" hint="The first screen. Industries, categories and brands come from the catalog.">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="h-eyebrow" label="Small line above the title">
              <Input id="h-eyebrow" value={f.hero.eyebrow} onChange={hero("eyebrow")} />
            </Field>
            <Field id="h-title" label="Title (empty = the tagline)">
              <Input id="h-title" value={f.hero.title} placeholder={tagline} onChange={hero("title")} />
            </Field>
          </div>
          <Field id="h-sub" label="Text under the title">
            <Textarea id="h-sub" rows={2} value={f.hero.subtitle} onChange={hero("subtitle")} />
          </Field>
          <Field id="h-cta2" label="Second button (goes to the industries)">
            <Input id="h-cta2" className="sm:max-w-xs" value={f.hero.secondaryCta} onChange={hero("secondaryCta")} />
          </Field>
        </Section>

        <Section title="Feature cards" hint="Three cards under the hero; the middle one is the lime highlight">
          {f.features.map((x, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[8rem_1fr_12rem_10rem]">
              <Input aria-label={`Card ${i + 1} tag`} placeholder="Tag" value={x.tag} onChange={row("features", i, "tag")} />
              <Input aria-label={`Card ${i + 1} title`} placeholder="Title" value={x.title} onChange={row("features", i, "title")} />
              <Input aria-label={`Card ${i + 1} link`} placeholder="/industries/real-estate" value={x.href} onChange={row("features", i, "href")} />
              <Input aria-label={`Card ${i + 1} image`} placeholder="Image name" value={x.image} onChange={row("features", i, "image")} />
            </div>
          ))}
        </Section>

        <Section title="Key numbers" hint="Up to 4, shown in the dark band">
          <div className="grid gap-2 sm:grid-cols-4">
            {f.stats.map((s, i) => (
              <div key={i} className="grid gap-1.5">
                <Input aria-label={`Number ${i + 1}`} placeholder="Value, e.g. 24h" value={s.value} onChange={row("stats", i, "value")} />
                <Input aria-label={`Number ${i + 1} label`} placeholder="Label" value={s.label} onChange={row("stats", i, "label")} />
              </div>
            ))}
          </div>
        </Section>

        <Section title="How it works" hint="Three steps">
          {f.steps.map((s, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[14rem_1fr]">
              <Input aria-label={`Step ${i + 1} title`} placeholder={`Step ${i + 1}`} value={s.title} onChange={row("steps", i, "title")} />
              <Input aria-label={`Step ${i + 1} text`} placeholder="One sentence" value={s.text} onChange={row("steps", i, "text")} />
            </div>
          ))}
        </Section>

        <Section title="Why Zeronix Tech" hint="Up to 4 reasons with an icon">
          {f.reasons.map((r, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[10rem_14rem_1fr]">
              <NativeSelect aria-label={`Reason ${i + 1} icon`} value={r.icon} onChange={row("reasons", i, "icon")}>
                <NativeSelectOption value="">No icon</NativeSelectOption>
                {SITE_ICONS.map((ic) => (
                  <NativeSelectOption key={ic} value={ic}>
                    {ic}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <Input aria-label={`Reason ${i + 1} title`} placeholder="Title" value={r.title} onChange={row("reasons", i, "title")} />
              <Input aria-label={`Reason ${i + 1} text`} placeholder="One sentence" value={r.text} onChange={row("reasons", i, "text")} />
            </div>
          ))}
        </Section>

        <Section title="Closing call to action" hint="The dark band at the bottom of the page">
          <Field id="c-title" label="Title">
            <Input id="c-title" value={f.ctaBand.title} onChange={(e) => setF({ ...f, ctaBand: { ...f.ctaBand, title: e.target.value } })} />
          </Field>
          <Field id="c-text" label="Text">
            <Textarea id="c-text" rows={2} value={f.ctaBand.text} onChange={(e) => setF({ ...f, ctaBand: { ...f.ctaBand, text: e.target.value } })} />
          </Field>
        </Section>
      </fieldset>

      <div className="flex items-center gap-2">
        {canEdit && (
          <Button type="submit" pending={pending}>
            Save
          </Button>
        )}
        {siteUrl && (
          <Button variant="outline" nativeButton={false} render={<a href={siteUrl} target="_blank" rel="noreferrer" />}>
            <ExternalLink /> View the site
          </Button>
        )}
      </div>
    </form>
  );
}
