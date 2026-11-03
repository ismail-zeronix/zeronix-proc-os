"use client";

import { ExternalLink } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { SITE_ICONS, type SiteHome, type SiteIcon, type SitePromo } from "@/lib/website/contract";
import { updateHome } from "../actions";

/** Pads a list to `n` rows so empty rows can be filled in; empty rows are dropped on save. */
const pad = <T,>(rows: T[], n: number, blank: T): T[] => [...rows, ...Array.from({ length: Math.max(0, n - rows.length) }, () => (typeof blank === "object" ? { ...blank } : blank))];

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

function IconSelect({ value, label, onChange }: { value: SiteIcon | ""; label: string; onChange: (v: SiteIcon | "") => void }) {
  return (
    <NativeSelect aria-label={label} value={value} onChange={(e) => onChange(e.target.value as SiteIcon | "")}>
      <NativeSelectOption value="">No icon</NativeSelectOption>
      {SITE_ICONS.map((ic) => (
        <NativeSelectOption key={ic} value={ic}>
          {ic}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );
}

/** Title, text, button label and link of a panel or band. */
function PromoFields({ id, value, onChange }: { id: string; value: SitePromo; onChange: (v: SitePromo) => void }) {
  const set = (k: keyof SitePromo) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange({ ...value, [k]: e.target.value });
  return (
    <>
      <Field id={`${id}-title`} label="Title">
        <Input id={`${id}-title`} value={value.title} onChange={set("title")} />
      </Field>
      <Field id={`${id}-text`} label="Text">
        <Textarea id={`${id}-text`} rows={2} value={value.text} onChange={set("text")} />
      </Field>
      <div className="grid gap-2 sm:grid-cols-2">
        <Input aria-label="Button label" placeholder="Button label" value={value.cta} onChange={set("cta")} />
        <Input aria-label="Button link" placeholder="/quote" value={value.href} onChange={set("href")} />
      </div>
    </>
  );
}

export function HomeForm({ home, tagline, siteUrl, canEdit }: { home: SiteHome; tagline: string; siteUrl: string; canEdit: boolean }) {
  const link = { label: "", href: "" };
  const iconLink = { icon: "" as const, label: "", href: "" };
  const [f, setF] = useState<SiteHome>({
    ...home,
    topLinks: pad(home.topLinks, 4, link),
    hero: { ...home.hero, checks: pad(home.hero.checks, 3, "") },
    benefits: pad(home.benefits, 4, { icon: "", title: "", text: "" }),
    services: pad(home.services, 8, iconLink),
    stats: pad(home.stats, 4, { value: "", label: "" }),
    reasons: pad(home.reasons, 4, { icon: "", title: "", text: "" }),
  });
  const [pending, start] = useTransition();

  const hero = (k: "eyebrow" | "title" | "subtitle" | "shopLabel") => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, hero: { ...f.hero, [k]: e.target.value } });
  type Lists = "topLinks" | "benefits" | "services" | "stats" | "reasons";
  const setRow = <K extends Lists>(list: K, i: number, k: string, v: string) => setF({ ...f, [list]: f[list].map((r, j) => (j === i ? { ...r, [k]: v } : r)) });
  const row = (list: Lists, i: number, k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setRow(list, i, k, e.target.value);

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
        <Section title="Top bar" hint="Short links above the header; location, phone and WhatsApp come from Settings">
          <div className="grid gap-2 sm:grid-cols-2">
            {f.topLinks.map((l, i) => (
              <div key={i} className="grid grid-cols-2 gap-2">
                <Input aria-label={`Top link ${i + 1}`} placeholder="Label" value={l.label} onChange={row("topLinks", i, "label")} />
                <Input aria-label={`Top link ${i + 1} address`} placeholder="/products" value={l.href} onChange={row("topLinks", i, "href")} />
              </div>
            ))}
          </div>
        </Section>

        <Section title="Hero" hint="The first screen. The second button is the call to action from Settings (to /quote).">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="h-eyebrow" label="Small line above the title">
              <Input id="h-eyebrow" value={f.hero.eyebrow} onChange={hero("eyebrow")} />
            </Field>
            <Field id="h-title" label="Title (empty = the tagline; the last line is highlighted)">
              <Input id="h-title" value={f.hero.title} placeholder={tagline} onChange={hero("title")} />
            </Field>
          </div>
          <Field id="h-sub" label="Text under the title">
            <Textarea id="h-sub" rows={2} value={f.hero.subtitle} onChange={hero("subtitle")} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-[14rem_1fr]">
            <Field id="h-shop" label="First button (to the products)">
              <Input id="h-shop" value={f.hero.shopLabel} onChange={hero("shopLabel")} />
            </Field>
            <div className="grid gap-1.5">
              <Label>Ticks under the buttons</Label>
              <div className="grid gap-2 sm:grid-cols-3">
                {f.hero.checks.map((c, i) => (
                  <Input key={i} aria-label={`Tick ${i + 1}`} value={c} onChange={(e) => setF({ ...f, hero: { ...f.hero, checks: f.hero.checks.map((x, j) => (j === i ? e.target.value : x)) } })} />
                ))}
              </div>
            </div>
          </div>
        </Section>

        <Section title="Benefit strip" hint="Four short promises in the trust bar along the bottom of the hero">
          {f.benefits.map((b, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[10rem_14rem_1fr]">
              <IconSelect label={`Benefit ${i + 1} icon`} value={b.icon} onChange={(v) => setRow("benefits", i, "icon", v)} />
              <Input aria-label={`Benefit ${i + 1} title`} placeholder="UAE-wide delivery" value={b.title} onChange={row("benefits", i, "title")} />
              <Input aria-label={`Benefit ${i + 1} text`} placeholder="Fast, tracked and insured" value={b.text} onChange={row("benefits", i, "text")} />
            </div>
          ))}
        </Section>

        <div className="grid gap-3 lg:grid-cols-2">
          <Section title="Bundles band" hint="Forest band before the featured products">
            <PromoFields id="bundles" value={f.bundles} onChange={(bundles) => setF({ ...f, bundles })} />
          </Section>
          <Section title="Featured products" hint="Heading of the product shelf (products come from the catalog)">
            <Field id="feat-title" label="Title">
              <Input id="feat-title" value={f.featured.title} onChange={(e) => setF({ ...f, featured: { ...f.featured, title: e.target.value } })} />
            </Field>
            <Field id="feat-text" label="Text">
              <Textarea id="feat-text" rows={2} value={f.featured.text} onChange={(e) => setF({ ...f, featured: { ...f.featured, text: e.target.value } })} />
            </Field>
          </Section>
        </div>

        <Section title="IT services" hint="Up to 8 tiles; each links to a service page">
          {f.services.map((x, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[10rem_1fr_18rem]">
              <IconSelect label={`Service ${i + 1} icon`} value={x.icon} onChange={(v) => setRow("services", i, "icon", v)} />
              <Input aria-label={`Service ${i + 1}`} placeholder="Networking and Wi-Fi" value={x.label} onChange={row("services", i, "label")} />
              <Input aria-label={`Service ${i + 1} link`} placeholder="/services/networking-wifi" value={x.href} onChange={row("services", i, "href")} />
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

        <Section title="Why Zeronix Tech" hint="Up to 4 reasons with an icon">
          {f.reasons.map((r, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[10rem_14rem_1fr]">
              <IconSelect label={`Reason ${i + 1} icon`} value={r.icon} onChange={(v) => setRow("reasons", i, "icon", v)} />
              <Input aria-label={`Reason ${i + 1} title`} placeholder="Title" value={r.title} onChange={row("reasons", i, "title")} />
              <Input aria-label={`Reason ${i + 1} text`} placeholder="One sentence" value={r.text} onChange={row("reasons", i, "text")} />
            </div>
          ))}
        </Section>

        <Section title="Closing call to action" hint="The lime band at the bottom of the page">
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
