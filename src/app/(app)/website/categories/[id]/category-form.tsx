"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { CategoryInput } from "@/lib/website/catalog";
import { templateToText, textToTemplate } from "@/lib/website/spec-template";
import { saveCategoryAction } from "../../catalog-actions";
import { Field, IconSelect, ImagesField, Panel, StatusSelect, useLocal, useSave } from "../../catalog-ui";

const blank: CategoryInput = { slug: "", name: "", icon: "", description: "", specTemplate: { groups: [] }, seo: {}, image: null, sort: 0, status: "draft" };

export function CategoryForm({ id, initial }: { id?: number; initial?: Partial<CategoryInput> }) {
  const [f, patch] = useLocal<CategoryInput>({ ...blank, ...initial, seo: initial?.seo ?? {}, image: initial?.image ?? null });
  const [specText, setSpecText] = useState(templateToText(f.specTemplate));
  const [pending, save] = useSave("/website/categories", id);
  const parsed = textToTemplate(specText);

  return (
    <form
      className="grid gap-3 lg:grid-cols-[1fr_20rem]"
      onSubmit={(e) => {
        e.preventDefault();
        save(() => saveCategoryAction({ ...f, specTemplate: parsed }, id));
      }}
    >
      <div className="grid content-start gap-3">
        <Panel title="Category">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="name" label="Name">
              <Input id="name" value={f.name} onChange={(e) => patch({ name: e.target.value })} />
            </Field>
            <Field id="slug" label="Web address" hint={`/products/${f.slug || "made-from-the-name"}`}>
              <Input id="slug" value={f.slug} onChange={(e) => patch({ slug: e.target.value })} />
            </Field>
          </div>
          <Field id="desc" label="Description" hint="Card, mega menu and the top of the category page">
            <Textarea id="desc" rows={2} value={f.description} onChange={(e) => patch({ description: e.target.value })} />
          </Field>
        </Panel>
        <Panel title="Spec template" hint={`${parsed.groups.length} groups · ${parsed.groups.reduce((n, g) => n + g.fields.length, 0)} fields`}>
          <Textarea id="specs" rows={16} className="font-mono text-xs" value={specText} onChange={(e) => setSpecText(e.target.value)} />
          <p className="text-xs text-muted-foreground">
            A line on its own starts a group. An indented <code>key: Label</code> is a spec; add <code>*</code> at the end to let visitors filter on it. Keys are what product .md files use under <code>specs:</code>.
          </p>
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
        <Panel title="Picture" hint="Product shot on sage, 1:1">
          <ImagesField value={f.image ? [f.image] : []} onChange={(v) => patch({ image: v[0] ?? null })} altDefault={f.name} />
        </Panel>
        <Panel title="Search engines">
          <Field id="seo-title" label="Title">
            <Input id="seo-title" value={f.seo.title ?? ""} onChange={(e) => patch({ seo: { ...f.seo, title: e.target.value } })} />
          </Field>
          <Field id="seo-desc" label="Description">
            <Textarea id="seo-desc" rows={3} value={f.seo.description ?? ""} onChange={(e) => patch({ seo: { ...f.seo, description: e.target.value } })} />
          </Field>
        </Panel>
      </div>
    </form>
  );
}
