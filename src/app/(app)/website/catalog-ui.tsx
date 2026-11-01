"use client";

import { ImagePlus, Plus, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { SITE_ICONS } from "@/lib/website/contract";
import type { SiteImage } from "@/lib/website/types";
import { uploadSiteImageAction } from "./catalog-actions";

/** Shared pieces of the catalog editors (industries, categories, brands, products). */

export function Field({ id, label, hint, className, children }: { id: string; label: string; hint?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`grid content-start gap-1.5 ${className ?? ""}`}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}

export function Panel({ title, hint, children, className }: { title: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-lg border bg-card ${className ?? ""}`}>
      <div className="flex items-baseline gap-2 border-b px-3 py-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
      <div className="grid gap-3 p-3">{children}</div>
    </section>
  );
}

export function StatusSelect({ value, onChange }: { value: string; onChange: (v: "draft" | "published" | "archived") => void }) {
  return (
    <NativeSelect id="status" value={value} onChange={(e) => onChange(e.target.value as "draft" | "published" | "archived")}>
      <NativeSelectOption value="draft">Draft (not on the site)</NativeSelectOption>
      <NativeSelectOption value="published">Published</NativeSelectOption>
      <NativeSelectOption value="archived">Archived</NativeSelectOption>
    </NativeSelect>
  );
}

export function IconSelect({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  return (
    <NativeSelect id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      <NativeSelectOption value="">No icon</NativeSelectOption>
      {SITE_ICONS.map((i) => (
        <NativeSelectOption key={i} value={i}>
          {i}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );
}

/** A list of short strings edited as one line each. */
export function LinesInput({ id, value, onChange, rows = 4, placeholder }: { id: string; value: string[]; onChange: (v: string[]) => void; rows?: number; placeholder?: string }) {
  return <Textarea id={id} rows={rows} placeholder={placeholder} value={value.join("\n")} onChange={(e) => onChange(e.target.value.split("\n"))} />;
}

/** Repeating rows (FAQ, roles, best-for): render each row, add and remove. */
export function Rows<T>({ items, onChange, blank, render, addLabel }: { items: T[]; onChange: (v: T[]) => void; blank: T; render: (item: T, set: (v: T) => void, i: number) => React.ReactNode; addLabel: string }) {
  return (
    <div className="grid gap-2">
      {items.map((item, i) => (
        <div key={i} className="flex items-start gap-2">
          <div className="min-w-0 flex-1">{render(item, (v) => onChange(items.map((x, j) => (j === i ? v : x))), i)}</div>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove row" onClick={() => onChange(items.filter((_, j) => j !== i))}>
            <Trash2 />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => onChange([...items, structuredClone(blank)])}>
        <Plus /> {addLabel}
      </Button>
    </div>
  );
}

export function FaqRows({ value, onChange }: { value: { q: string; a: string }[]; onChange: (v: { q: string; a: string }[]) => void }) {
  return (
    <Rows
      items={value}
      onChange={onChange}
      blank={{ q: "", a: "" }}
      addLabel="Add question"
      render={(x, set, i) => (
        <div className="grid gap-1.5">
          <Input aria-label={`Question ${i + 1}`} placeholder="Question" value={x.q} onChange={(e) => set({ ...x, q: e.target.value })} />
          <Textarea aria-label={`Answer ${i + 1}`} rows={2} placeholder="Answer" value={x.a} onChange={(e) => set({ ...x, a: e.target.value })} />
        </div>
      )}
    />
  );
}

const preview = (img: SiteImage) => `/api/website-media/${img.fileId}`;

/** Upload pictures for the site; `multiple` keeps a list (products), otherwise one picture or none. */
export function ImagesField({ value, onChange, multiple = false, altDefault }: { value: SiteImage[]; onChange: (v: SiteImage[]) => void; multiple?: boolean; altDefault: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const upload = (files: FileList | null) => {
    if (!files?.length) return;
    start(async () => {
      const added: SiteImage[] = [];
      for (const file of [...files].slice(0, multiple ? 12 : 1)) {
        const form = new FormData();
        form.set("file", file);
        form.set("alt", altDefault);
        const res = await uploadSiteImageAction(form);
        if (res.error !== undefined) {
          toast.error(res.error);
          break;
        }
        added.push(res.value);
      }
      if (added.length) onChange(multiple ? [...value, ...added] : added.slice(0, 1));
    });
  };
  return (
    <div className="grid gap-2">
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {value.map((img, i) => (
            <li key={img.fileId} className="grid w-36 gap-1">
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element -- portal preview of an uploaded file */}
                <img src={preview(img)} alt={img.alt} className="aspect-[4/3] w-36 rounded-md border object-cover" />
                <button type="button" aria-label="Remove picture" className="absolute top-1 right-1 rounded-full bg-background/90 p-0.5" onClick={() => onChange(value.filter((_, j) => j !== i))}>
                  <X className="size-3.5" />
                </button>
                {i === 0 && multiple && <span className="absolute bottom-1 left-1 rounded bg-background/90 px-1 text-[10px]">Main</span>}
              </div>
              <Input aria-label="Picture description (alt text)" className="h-7 text-xs" value={img.alt} onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, alt: e.target.value } : x)))} />
            </li>
          ))}
        </ul>
      )}
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple={multiple} hidden onChange={(e) => upload(e.target.files)} />
      <Button type="button" variant="outline" size="sm" className="w-fit" pending={pending} onClick={() => input.current?.click()}>
        <ImagePlus /> {value.length && !multiple ? "Replace picture" : "Upload picture"}
      </Button>
    </div>
  );
}

/** Save button + after-save behaviour shared by every editor: a new record jumps to its own page. */
export function useSave(base: string, id?: number) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const save = (fn: () => Promise<{ error?: string; value?: number }>) =>
    start(async () => {
      const res = await fn();
      if (res.error !== undefined) return void toast.error(res.error);
      toast.success("Saved");
      if (!id && res.value) router.replace(`${base}/${res.value}`);
      else router.refresh();
    });
  return [pending, save] as const;
}

export function useLocal<T>(initial: T) {
  const [v, set] = useState(initial);
  const patch = (p: Partial<T>) => set((cur) => ({ ...cur, ...p }));
  return [v, patch, set] as const;
}
