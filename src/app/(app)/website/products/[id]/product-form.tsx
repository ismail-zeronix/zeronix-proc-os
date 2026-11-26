"use client";

import { ImageDown, Link2, X } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { ago } from "@/lib/format";
import type { ProductInput } from "@/lib/website/catalog";
import { AVAILABILITY, AVAILABILITY_LABEL, type Availability } from "@/lib/website/store-core";
import type { SiteImage, SiteSpecTemplate } from "@/lib/website/types";
import { picturesFromLinksAction, saveProductAction, searchPortalProductsAction } from "../../catalog-actions";
import { FaqRows, Field, ImagesField, LinesInput, Panel, Rows, StatusSelect, useLocal, useSave } from "../../catalog-ui";

const blank: ProductInput = {
  slug: "",
  name: "",
  series: "",
  mpn: "",
  categoryId: null,
  brandId: null,
  summary: "",
  highlights: [],
  specs: {},
  images: [],
  uaeAvailable: true,
  uaeNotes: {},
  sourceUrl: "",
  specsChecked: false,
  pros: [],
  cons: [],
  faq: [],
  seo: {},
  portalProductId: null,
  status: "draft",
  links: [],
};

interface Props {
  id?: number;
  initial?: Partial<ProductInput>;
  checkedAt: string | null;
  categories: { id: number; name: string; specTemplate: SiteSpecTemplate }[];
  brands: { id: number; name: string }[];
  industries: { id: number; name: string }[];
}

export function ProductForm({ id, initial, checkedAt, categories, brands, industries }: Props) {
  const [f, patch] = useLocal<ProductInput>({ ...blank, ...initial, uaeNotes: initial?.uaeNotes ?? {}, seo: initial?.seo ?? {} });
  const [pending, save] = useSave("/website/products", id);
  const template = categories.find((c) => c.id === f.categoryId)?.specTemplate;
  const templateKeys = new Set(template?.groups.flatMap((g) => g.fields.map((x) => x.key)) ?? []);
  const extra = Object.entries(f.specs).filter(([k]) => !templateKeys.has(k));
  const setSpec = (k: string, v: string) => patch({ specs: { ...f.specs, [k]: v } });

  return (
    <form
      className="grid gap-3 xl:grid-cols-[1fr_22rem]"
      onSubmit={(e) => {
        e.preventDefault();
        save(() => saveProductAction({ ...f, highlights: f.highlights.filter(Boolean), pros: f.pros.filter(Boolean), cons: f.cons.filter(Boolean) }, id));
      }}
    >
      <div className="grid content-start gap-3">
        <Panel title="Product">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="name" label="Name" className="sm:col-span-2">
              <Input id="name" value={f.name} placeholder="HP EliteBook 840 G11" onChange={(e) => patch({ name: e.target.value })} />
            </Field>
            <Field id="brand" label="Brand">
              <NativeSelect id="brand" value={f.brandId ?? ""} onChange={(e) => patch({ brandId: e.target.value ? Number(e.target.value) : null })}>
                <NativeSelectOption value="">No brand</NativeSelectOption>
                {brands.map((b) => (
                  <NativeSelectOption key={b.id} value={b.id}>
                    {b.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Field id="category" label="Category" hint="Decides which specs are asked for below">
              <NativeSelect id="category" value={f.categoryId ?? ""} onChange={(e) => patch({ categoryId: e.target.value ? Number(e.target.value) : null })}>
                <NativeSelectOption value="">Pick a category</NativeSelectOption>
                {categories.map((c) => (
                  <NativeSelectOption key={c.id} value={c.id}>
                    {c.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Field id="mpn" label="Part number" hint="The exact maker part number. Middle East ones end e.g. #ABV (Arabic/English); for US ones (…US, #ABA) fill in the keyboard and warranty">
              <Input id="mpn" value={f.mpn} onChange={(e) => patch({ mpn: e.target.value })} />
            </Field>
            <Field id="series" label="Series">
              <Input id="series" value={f.series} placeholder="EliteBook 800" onChange={(e) => patch({ series: e.target.value })} />
            </Field>
            <Field id="slug" label="Web address" className="sm:col-span-2" hint="Empty = made from the name">
              <Input id="slug" value={f.slug} onChange={(e) => patch({ slug: e.target.value })} />
            </Field>
          </div>
          <Field id="summary" label="Description (Markdown)">
            <Textarea id="summary" rows={5} value={f.summary} onChange={(e) => patch({ summary: e.target.value })} />
          </Field>
          <Field id="highlights" label="Highlights" hint="One per line, up to 8">
            <LinesInput id="highlights" value={f.highlights} onChange={(highlights) => patch({ highlights })} rows={3} />
          </Field>
        </Panel>

        <Panel title="Specifications" hint={template ? "From the category's template" : "Pick a category to get its spec fields"}>
          {template?.groups.map((g) => (
            <div key={g.label} className="grid gap-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase">{g.label}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {g.fields.map((x) => (
                  <Field key={x.key} id={`spec-${x.key}`} label={x.label}>
                    <Input id={`spec-${x.key}`} value={f.specs[x.key] ?? ""} onChange={(e) => setSpec(x.key, e.target.value)} />
                  </Field>
                ))}
              </div>
            </div>
          ))}
          {extra.length > 0 && (
            <div className="grid gap-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase">Not in the template (shown under &quot;More&quot;)</p>
              {extra.map(([k, v]) => (
                <div key={k} className="flex items-center gap-2">
                  <span className="w-40 shrink-0 truncate text-sm">{k}</span>
                  <Input aria-label={k} value={v} onChange={(e) => setSpec(k, e.target.value)} />
                </div>
              ))}
            </div>
          )}
          <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
            <Field id="source" label="Spec source (brand page)">
              <Input id="source" value={f.sourceUrl} placeholder="https://www.hp.com/ae-en/…" onChange={(e) => patch({ sourceUrl: e.target.value })} />
            </Field>
            <label className="flex h-9 items-center gap-2 text-sm">
              <Checkbox checked={f.specsChecked} onCheckedChange={(on) => patch({ specsChecked: on === true })} />
              Checked against the source today
            </label>
          </div>
          <p className="text-xs text-muted-foreground">{checkedAt ? `Last checked ${ago(new Date(checkedAt))}.` : "Never checked against the brand's page."}</p>
        </Panel>

        <Panel title="Who it is for" hint="Puts the product on industry pages (e.g. 'Best for agents')">
          <Rows
            items={f.links}
            onChange={(links) => patch({ links })}
            blank={{ industryId: industries[0]?.id ?? 0, role: "", label: "", rank: 0 }}
            addLabel="Add industry"
            render={(l, set, i) => (
              <div className="grid gap-1.5 sm:grid-cols-[14rem_1fr_12rem]">
                <NativeSelect aria-label={`Industry ${i + 1}`} value={l.industryId} onChange={(e) => set({ ...l, industryId: Number(e.target.value) })}>
                  {industries.map((x) => (
                    <NativeSelectOption key={x.id} value={x.id}>
                      {x.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
                <Input aria-label={`Role ${i + 1}`} placeholder="Role, e.g. Agents on the move" value={l.role} onChange={(e) => set({ ...l, role: e.target.value })} />
                <Input aria-label={`Label ${i + 1}`} placeholder="Best overall" value={l.label} onChange={(e) => set({ ...l, label: e.target.value })} />
              </div>
            )}
          />
        </Panel>

        <div className="grid gap-3 md:grid-cols-2">
          <Panel title="Pros">
            <LinesInput id="pros" value={f.pros} onChange={(pros) => patch({ pros })} />
          </Panel>
          <Panel title="Cons">
            <LinesInput id="cons" value={f.cons} onChange={(cons) => patch({ cons })} />
          </Panel>
        </div>

        <Panel title="Questions and answers">
          <FaqRows value={f.faq} onChange={(faq) => patch({ faq })} />
        </Panel>
      </div>

      <div className="grid content-start gap-3">
        <Panel title="Publish">
          <Field id="status" label="Status">
            <StatusSelect value={f.status} onChange={(status) => patch({ status })} />
          </Field>
          <div className="grid grid-cols-[1fr_7rem] gap-2">
            <Field id="price-mode" label="How it's sold">
              <NativeSelect id="price-mode" value={f.priceMode ?? "on_request"} onChange={(e) => patch({ priceMode: e.target.value as NonNullable<ProductInput["priceMode"]> })}>
                <NativeSelectOption value="public">Sell online: price + Add to cart</NativeSelectOption>
                <NativeSelectOption value="on_request">Quote only: Add to quote</NativeSelectOption>
              </NativeSelect>
            </Field>
            <Field id="price" label="AED, with VAT">
              <Input id="price" inputMode="decimal" value={f.listPrice ?? ""} disabled={f.priceMode !== "public"} onChange={(e) => patch({ listPrice: e.target.value })} />
            </Field>
          </div>
          <Field id="availability" label="Stock label on the site">
            <NativeSelect id="availability" value={f.availability ?? "in_stock"} onChange={(e) => patch({ availability: e.target.value as Availability })}>
              {AVAILABILITY.map((a) => (
                <NativeSelectOption key={a} value={a}>
                  {AVAILABILITY_LABEL[a]}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Button type="submit" pending={pending}>
            Save
          </Button>
        </Panel>
        <Panel title="Pictures" hint="The first one is the main picture">
          <ImagesField multiple value={f.images} onChange={(images) => patch({ images })} altDefault={f.name} />
          <PictureLinks alt={f.name} onAdd={(images) => patch({ images: [...f.images, ...images].slice(0, 12) })} />
        </Panel>
        <Panel title="In the UAE">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={f.uaeAvailable} onCheckedChange={(on) => patch({ uaeAvailable: on === true })} />
            Available in the UAE
          </label>
          <Field id="kb" label="Keyboard">
            <Input id="kb" value={f.uaeNotes.keyboard ?? ""} placeholder="Arabic/English" onChange={(e) => patch({ uaeNotes: { ...f.uaeNotes, keyboard: e.target.value } })} />
          </Field>
          <Field id="war" label="Warranty">
            <Input id="war" value={f.uaeNotes.warranty ?? ""} placeholder="3 years, Middle East" onChange={(e) => patch({ uaeNotes: { ...f.uaeNotes, warranty: e.target.value } })} />
          </Field>
        </Panel>
        <PortalLink value={f.portalProductId} onChange={(portalProductId) => patch({ portalProductId })} />
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

/** "Add pictures from links": the maker's or distributor's picture links, downloaded and saved under our own names. */
function PictureLinks({ alt, onAdd }: { alt: string; onAdd: (images: SiteImage[]) => void }) {
  const [links, setLinks] = useState("");
  const [pending, start] = useTransition();
  return (
    <div className="grid gap-1.5">
      <Textarea aria-label="Picture links" rows={2} value={links} placeholder="Or paste picture links, one per line" onChange={(e) => setLinks(e.target.value)} className="text-xs" />
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="justify-self-start"
        pending={pending}
        disabled={!links.trim()}
        onClick={() =>
          start(async () => {
            const res = await picturesFromLinksAction(links.split(/\s+/).filter(Boolean), alt);
            if (res.error !== undefined) return void toast.error(res.error);
            if (res.value.images.length) {
              onAdd(res.value.images);
              setLinks("");
              toast.success(`${res.value.images.length} picture(s) added: Save to keep them`);
            }
            if (res.value.problems.length) toast.error(`Not added: ${res.value.problems.join("; ")}`, { duration: 12000 });
          })
        }
      >
        <ImageDown /> Add from links
      </Button>
    </div>
  );
}

/** Link to the same model in Procurement (supplier prices and stock come from there once the shop is live). */
function PortalLink({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<{ id: number; brand: string; modelName: string; partNumber: string }[]>([]);
  const [pending, start] = useTransition();
  return (
    <Panel title="Procurement product" hint="For prices and stock later">
      {value ? (
        <div className="flex items-center gap-2 text-sm">
          <Link2 className="size-4 text-emerald-600" /> Linked to procurement product #{value}
          <Button type="button" size="icon-sm" variant="ghost" aria-label="Unlink" onClick={() => onChange(null)}>
            <X />
          </Button>
        </div>
      ) : (
        <>
          <div className="flex gap-2">
            <Input aria-label="Search procurement products" placeholder="Part number or model" value={q} onChange={(e) => setQ(e.target.value)} />
            <Button type="button" variant="outline" pending={pending} onClick={() => start(async () => setHits(await searchPortalProductsAction(q)))}>
              Find
            </Button>
          </div>
          {hits.map((h) => (
            <button key={h.id} type="button" className="rounded-md border p-2 text-left text-sm hover:bg-muted" onClick={() => onChange(h.id)}>
              {h.brand} {h.modelName} <span className="text-muted-foreground">{h.partNumber}</span>
            </button>
          ))}
        </>
      )}
    </Panel>
  );
}
