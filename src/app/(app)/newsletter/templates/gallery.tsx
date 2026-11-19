"use client";

import { Check, Code2, PenLine, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { THEMES, withTheme } from "@/lib/newsletter/blocks";
import { renderEmail } from "@/lib/newsletter/render";
import { BLANK_KEY, HTML_KEY, SAMPLE_PRODUCTS, withSamples } from "@/lib/newsletter/templates";
import type { NewsBrand, TemplateDef } from "@/lib/newsletter/types";
import { MailFrame } from "../mail-frame";

/** The template gallery: search, filter by kind, and see every design in any colour theme before using it. */
export function Gallery({ templates, brand, logoSrc }: { templates: TemplateDef[]; brand: NewsBrand; logoSrc: string }) {
  const [group, setGroup] = useState("All");
  const [q, setQ] = useState("");
  const [theme, setTheme] = useState<string>("");

  const groups = useMemo(() => ["All", ...new Set(templates.map((t) => t.group))], [templates]);
  const shown = templates.filter((t) => (group === "All" || t.group === group) && (!q.trim() || `${t.name} ${t.blurb} ${t.category}`.toLowerCase().includes(q.trim().toLowerCase())));
  const suffix = theme ? `&theme=${theme}` : "";

  return (
    <div className="grid gap-4">
      <div className="grid gap-2 sm:grid-cols-2">
        <Link href={`/newsletter/campaigns/new?template=${BLANK_KEY}${suffix}`} className="group flex items-start gap-3 rounded-xl border border-dashed bg-card p-3 hover:border-foreground/40 hover:bg-muted/50">
          <PenLine className="mt-0.5 size-5 shrink-0" />
          <span>
            <span className="block text-sm font-semibold">Start from a blank design</span>
            <span className="block text-xs text-muted-foreground">Add your own sections: banner, text, pictures, buttons, products.</span>
          </span>
        </Link>
        <Link href={`/newsletter/campaigns/new?template=${HTML_KEY}`} className="group flex items-start gap-3 rounded-xl border border-dashed bg-card p-3 hover:border-foreground/40 hover:bg-muted/50">
          <Code2 className="mt-0.5 size-5 shrink-0" />
          <span>
            <span className="block text-sm font-semibold">Paste your own HTML code</span>
            <span className="block text-xs text-muted-foreground">Made elsewhere? Paste it, or copy our prompt for an AI tool. The legal footer is added for you.</span>
          </span>
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search templates" className="pl-8" aria-label="Search templates" />
        </div>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Filter by kind">
          {groups.map((g) => (
            <button key={g} type="button" aria-pressed={group === g} onClick={() => setGroup(g)} className={`rounded-full border px-3 py-1 text-xs font-medium ${group === g ? "border-foreground bg-foreground text-background" : "hover:bg-muted"}`}>
              {g}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Colours</span>
          <button type="button" title="As designed" aria-label="Colours as designed" aria-pressed={theme === ""} onClick={() => setTheme("")} className={`rounded-full border px-2.5 py-1 text-xs ${theme === "" ? "border-foreground" : "hover:bg-muted"}`}>
            As designed
          </button>
          {THEMES.map((t) => (
            <button key={t.key} type="button" title={t.label} aria-label={t.label} aria-pressed={theme === t.key} onClick={() => setTheme(t.key)} className={`relative flex overflow-hidden rounded-full border-2 ${theme === t.key ? "border-foreground" : "border-transparent hover:border-muted-foreground/40"}`}>
              <span className="size-6" style={{ background: t.brand }} />
              <span className="size-6" style={{ background: t.accent }} />
              {theme === t.key && <Check className="absolute inset-0 m-auto size-3.5 text-white mix-blend-difference" />}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {shown.map((t) => {
          const { html } = renderEmail({ doc: withTheme(withSamples(t.doc), theme), subject: t.subject, preheader: t.preheader, products: SAMPLE_PRODUCTS, brand, logoSrc, firstName: "", unsubUrl: "#", reason: "" });
          const hasProducts = t.doc.blocks.some((b) => b.type === "products");
          return (
            <section key={t.key} className="group overflow-hidden rounded-xl border bg-card transition-shadow hover:shadow-md">
              <div className="relative bg-muted/40 px-3 pt-3">
                <div className="mx-auto h-[330px] overflow-hidden">
                  <MailFrame html={html} title={t.name} height={660} scale={0.5} />
                </div>
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-card to-transparent" />
                <div className="absolute inset-0 flex items-center justify-center gap-2 bg-background/60 opacity-0 backdrop-blur-[1px] transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                  <Button size="sm" nativeButton={false} render={<Link href={`/newsletter/campaigns/new?template=${t.key}${suffix}`} />}>
                    Use this template
                  </Button>
                  <Button size="sm" variant="secondary" nativeButton={false} render={<Link href={`/newsletter/templates/${t.key}${theme ? `?theme=${theme}` : ""}`} />}>
                    Full preview
                  </Button>
                </div>
              </div>
              <div className="grid gap-1 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold">{t.name}</div>
                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{t.group}</span>
                </div>
                <div className="text-xs text-muted-foreground">{t.blurb}</div>
                <div className="text-[11px] text-muted-foreground">
                  {t.doc.blocks.length} sections{hasProducts ? " · picks products from the website" : ""}
                </div>
              </div>
            </section>
          );
        })}
        {!shown.length && <p className="col-span-full rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">No template matches. Clear the search or pick another kind.</p>}
      </div>
    </div>
  );
}
