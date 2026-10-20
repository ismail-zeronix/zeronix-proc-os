"use client";

import { ImageUp, Trash2 } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { SignaturePreview } from "@/components/signature-preview";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { type Brand, type Layout, LAYOUT_LABELS } from "@/lib/signature";
import { saveBrand } from "./actions";

/** Company branding for email signatures: logo, details, layout and a live preview. */
export function BrandCard({ brand, version, sample }: { brand: Brand; version: number; sample: { name: string; email: string } }) {
  const [f, setF] = useState({
    company: brand.company,
    tagline: brand.tagline,
    address: brand.address,
    website: brand.website,
    mainPhone: brand.mainPhone,
    layout: brand.layout,
    color: brand.color,
    disclaimer: brand.disclaimer,
  });
  // undefined = keep the saved logo, "remove" = delete it, otherwise a data URL picked just now
  const [logo, setLogo] = useState<string | undefined>(undefined);
  const [pending, start] = useTransition();
  const file = useRef<HTMLInputElement>(null);

  const hasLogo = logo === "remove" ? false : logo ? true : brand.hasLogo;
  const logoSrc = logo && logo !== "remove" ? logo : `/api/brand/logo?v=${version}`;

  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    e.target.value = "";
    if (!picked) return;
    if (!/^image\/(png|jpeg|webp)$/.test(picked.type)) return toast.error("Use a PNG, JPG or WebP image.");
    if (picked.size > 400 * 1024) return toast.error("That image is over 400 KB. Use a smaller one (about 300 px wide).");
    const reader = new FileReader();
    reader.onload = () => setLogo(String(reader.result));
    reader.readAsDataURL(picked);
  };

  const save = () =>
    start(async () => {
      try {
        await saveBrand({ ...f, ...(logo ? { logo } : {}) });
        toast.success("Branding saved");
        setLogo(undefined);
      } catch (e) {
        toast.error((e as Error).message);
      }
    });

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setF({ ...f, [k]: e.target.value });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Email branding</CardTitle>
        <CardDescription>
          Every user&apos;s email signature is built from this, plus their own name, title and phone (set under My account).
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 lg:grid-cols-2">
        <div className="grid content-start gap-3">
          <div className="grid gap-1.5">
            <Label>Logo</Label>
            <div className="flex flex-wrap items-center gap-2">
              {hasLogo && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoSrc} alt="Current logo" className="h-12 max-w-40 rounded border bg-white object-contain p-1" />
              )}
              <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={pick} />
              <Button type="button" variant="outline" size="sm" onClick={() => file.current?.click()}>
                <ImageUp /> {hasLogo ? "Replace" : "Upload"} logo
              </Button>
              {hasLogo && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setLogo("remove")}>
                  <Trash2 /> Remove
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">PNG, JPG or WebP, under 400 KB, about 300 px wide. Shown at 120 px in the email.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Company name</Label>
              <Input value={f.company} onChange={set("company")} />
            </div>
            <div className="grid gap-1.5">
              <Label>Website</Label>
              <Input value={f.website} onChange={set("website")} placeholder="www.zeronix.ae" />
            </div>
            <div className="grid gap-1.5">
              <Label>Main phone (used if a user has none)</Label>
              <Input value={f.mainPhone} onChange={set("mainPhone")} placeholder="+971 4 000 0000" />
            </div>
            <div className="grid gap-1.5">
              <Label>Tagline (optional)</Label>
              <Input value={f.tagline} onChange={set("tagline")} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Address</Label>
            <Textarea value={f.address} onChange={set("address")} placeholder={"Office 101, Example Tower\nDubai, UAE"} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Logo position</Label>
              <NativeSelect value={f.layout} onChange={(e) => setF({ ...f, layout: e.target.value as Layout })}>
                {(Object.keys(LAYOUT_LABELS) as Layout[]).map((k) => (
                  <NativeSelectOption key={k} value={k}>
                    {LAYOUT_LABELS[k]}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <div className="grid gap-1.5">
              <Label>Accent colour</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  aria-label="Pick accent colour"
                  value={/^#[0-9a-fA-F]{6}$/.test(f.color) ? f.color : "#2a78d6"}
                  onChange={(e) => setF({ ...f, color: e.target.value })}
                  className="h-9 w-12 cursor-pointer rounded border bg-transparent p-0.5"
                />
                <Input value={f.color} onChange={set("color")} className="font-mono" />
              </div>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Confidentiality line (optional)</Label>
            <Textarea value={f.disclaimer} onChange={set("disclaimer")} placeholder="This email and any attachments are confidential…" />
          </div>
          <Button className="w-fit" disabled={pending || !f.company.trim()} onClick={save}>
            Save branding
          </Button>
        </div>
        <div className="grid content-start gap-2">
          <Label>Preview</Label>
          <SignaturePreview
            brand={{ ...f, hasLogo }}
            person={{ name: sample.name, jobTitle: "Sales Manager", phone: "", mobile: "+971 50 000 0000", email: sample.email }}
            logoSrc={logoSrc}
          />
          <p className="text-xs text-muted-foreground">Sample details shown. Each user&apos;s own details replace them.</p>
        </div>
      </CardContent>
    </Card>
  );
}
