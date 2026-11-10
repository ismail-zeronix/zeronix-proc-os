"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SiteBrand } from "@/lib/website/contract";
import { updateBrand } from "./actions";

const FIELDS: { key: keyof SiteBrand; label: string; hint?: string; type?: string }[] = [
  { key: "name", label: "Site name" },
  { key: "tagline", label: "Tagline", hint: "The big line on the home page" },
  { key: "subline", label: "Second line", hint: "Under the tagline" },
  { key: "ctaLabel", label: "Call-to-action button", hint: "Header button and the default B2B button" },
  { key: "email", label: "Email", type: "email" },
  { key: "phone", label: "Phone", type: "tel" },
  { key: "whatsapp", label: "WhatsApp", type: "tel", hint: "Number with country code, e.g. 9715..." },
  { key: "address", label: "Address", hint: "Street, building and area exactly as on your Google Business Profile" },
  { key: "hours", label: "Opening hours", hint: "e.g. Mo-Sa 09:00-19:00 (this exact form is what Google reads). Shown in the footer and on Contact." },
  { key: "mapUrl", label: "Google Maps link", hint: "The share link of your Google Business Profile, starting with https://" },
  { key: "profiles", label: "Company profiles", hint: "LinkedIn, Google Business, Instagram... links separated by spaces. Search engines and AI assistants use them to recognise the company." },
];

export function BrandForm({ brand, canEdit }: { brand: SiteBrand; canEdit: boolean }) {
  const [f, setF] = useState(brand);
  const [pending, start] = useTransition();

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const res = await updateBrand(f);
      if (res.error !== undefined) return void toast.error(res.error);
      toast.success(res.value.siteRefreshed ? "Saved, the site is updated" : "Saved; the site picks it up within 10 minutes");
    });
  };

  return (
    <form onSubmit={save} className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {FIELDS.map((x) => (
          <div key={x.key} className="grid gap-1.5">
            <Label htmlFor={`brand-${x.key}`}>{x.label}</Label>
            <Input id={`brand-${x.key}`} type={x.type ?? "text"} value={f[x.key] ?? ""} disabled={!canEdit} onChange={(e) => setF({ ...f, [x.key]: e.target.value })} />
            {x.hint && <span className="text-xs text-muted-foreground">{x.hint}</span>}
          </div>
        ))}
      </div>
      {canEdit && (
        <div>
          <Button type="submit" pending={pending}>
            Save
          </Button>
        </div>
      )}
    </form>
  );
}
