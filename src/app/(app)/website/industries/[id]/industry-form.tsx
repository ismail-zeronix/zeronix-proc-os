"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { IndustryInput } from "@/lib/website/catalog";
import { saveIndustryAction } from "../../catalog-actions";
import { FaqRows, Field, IconSelect, ImagesField, LinesInput, Panel, Rows, StatusSelect, useLocal, useSave } from "../../catalog-ui";

const blank: IndustryInput = { slug: "", name: "", icon: "", summary: "", heroTitle: "", intro: "", painPoints: [], roles: [], faq: [], seo: {}, image: null, sort: 0, status: "draft" };

export function IndustryForm({ id, initial, categories }: { id?: number; initial?: Partial<IndustryInput>; categories: { slug: string; name: string }[] }) {
  const [f, patch] = useLocal<IndustryInput>({ ...blank, ...initial, seo: initial?.seo ?? {}, image: initial?.image ?? null });
  const [pending, save] = useSave("/website/industries", id);

  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        save(() => saveIndustryAction({ ...f, painPoints: f.painPoints.filter(Boolean) }, id));
      }}
    >
      <div className="grid gap-3 lg:grid-cols-[1fr_20rem]">
        <div className="grid content-start gap-3">
          <Panel title="Industry">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field id="name" label="Name">
                <Input id="name" value={f.name} onChange={(e) => patch({ name: e.target.value })} />
              </Field>
              <Field id="slug" label="Web address" hint={`/industries/${f.slug || "made-from-the-name"}`}>
                <Input id="slug" value={f.slug} placeholder="real-estate" onChange={(e) => patch({ slug: e.target.value })} />
              </Field>
            </div>
            <Field id="summary" label="One line" hint="Card, mega menu and search results">
              <Input id="summary" value={f.summary} onChange={(e) => patch({ summary: e.target.value })} />
            </Field>
            <Field id="hero" label="Page headline" hint="e.g. IT for real estate agencies in the UAE">
              <Input id="hero" value={f.heroTitle} onChange={(e) => patch({ heroTitle: e.target.value })} />
            </Field>
            <Field id="intro" label="Introduction (Markdown)">
              <Textarea id="intro" rows={6} value={f.intro} onChange={(e) => patch({ intro: e.target.value })} />
            </Field>
            <Field id="pains" label="What this industry struggles with" hint="One per line, up to 8">
              <LinesInput id="pains" value={f.painPoints} onChange={(painPoints) => patch({ painPoints })} />
            </Field>
          </Panel>

          <Panel title="Roles and what they need" hint="Shown as setups on the industry page">
            <Rows
              items={f.roles}
              onChange={(roles) => patch({ roles })}
              blank={{ role: "", needs: "", categories: [] }}
              addLabel="Add role"
              render={(r, set, i) => (
                <div className="grid gap-1.5 rounded-md border p-2">
                  <div className="grid gap-1.5 sm:grid-cols-[12rem_1fr]">
                    <Input aria-label={`Role ${i + 1}`} placeholder="Agent" value={r.role} onChange={(e) => set({ ...r, role: e.target.value })} />
                    <Input aria-label={`Role ${i + 1} needs`} placeholder="Light, long battery, 14-inch" value={r.needs} onChange={(e) => set({ ...r, needs: e.target.value })} />
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {categories.map((c) => (
                      <label key={c.slug} className="flex items-center gap-1.5 text-xs">
                        <Checkbox
                          checked={r.categories.includes(c.slug)}
                          onCheckedChange={(on) => set({ ...r, categories: on ? [...r.categories, c.slug] : r.categories.filter((x) => x !== c.slug) })}
                        />
                        {c.name}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            />
          </Panel>

          <Panel title="Questions and answers" hint="Shown on the page and as FAQ data for Google">
            <FaqRows value={f.faq} onChange={(faq) => patch({ faq })} />
          </Panel>
        </div>

        <div className="grid content-start gap-3">
          <Panel title="Publish">
            <Field id="status" label="Status">
              <StatusSelect value={f.status} onChange={(status) => patch({ status })} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field id="icon" label="Icon">
                <IconSelect id="icon" value={f.icon} onChange={(icon) => patch({ icon })} />
              </Field>
              <Field id="sort" label="Order">
                <Input id="sort" type="number" min={0} value={f.sort} onChange={(e) => patch({ sort: Number(e.target.value) || 0 })} />
              </Field>
            </div>
            <Button type="submit" pending={pending}>
              Save
            </Button>
          </Panel>
          <Panel title="Picture" hint="Card and page header, 4:3">
            <ImagesField value={f.image ? [f.image] : []} onChange={(v) => patch({ image: v[0] ?? null })} altDefault={f.name} />
          </Panel>
          <Panel title="Search engines">
            <Field id="seo-title" label="Title" hint="Empty = the name. Up to 60 characters.">
              <Input id="seo-title" value={f.seo.title ?? ""} onChange={(e) => patch({ seo: { ...f.seo, title: e.target.value } })} />
            </Field>
            <Field id="seo-desc" label="Description" hint="Up to 155 characters.">
              <Textarea id="seo-desc" rows={3} value={f.seo.description ?? ""} onChange={(e) => patch({ seo: { ...f.seo, description: e.target.value } })} />
            </Field>
          </Panel>
        </div>
      </div>
    </form>
  );
}
