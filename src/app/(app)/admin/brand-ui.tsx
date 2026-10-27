"use client";

import { ImageUp, Palette, Phone, Sparkles, Trash2, Type } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { SignaturePreview } from "@/components/signature-preview";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  type Brand,
  type BrandStyle,
  FONTS,
  type FontKey,
  LAYOUT_LABELS,
  LIMITS,
  LINE_STYLE_LABELS,
  type Layout,
  type LineStyle,
  STYLE_KEYS,
  TEMPLATE_LABELS,
  type Template,
  ZERONIX_SAMPLE,
} from "@/lib/signature";
import { saveBrand } from "./actions";

type Form = Omit<Brand, "hasLogo">;

/** Colour picker plus hex box. `allowEmpty` adds a "use accent" state for the divider line. */
function ColorField({
  label,
  value,
  onChange,
  fallback,
  emptyLabel,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  fallback: string;
  emptyLabel?: string;
}) {
  const shown = value || fallback;
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={label}
          value={/^#[0-9a-fA-F]{6}$/.test(shown) ? shown : "#000000"}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-12 shrink-0 cursor-pointer rounded border bg-transparent p-0.5"
        />
        <Input value={value} placeholder={emptyLabel} onChange={(e) => onChange(e.target.value)} className="font-mono" />
        {emptyLabel && value && (
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange("")} title={emptyLabel}>
            Reset
          </Button>
        )}
      </div>
    </div>
  );
}

/** Slider with the number beside it. */
function RangeField({
  label,
  value,
  onChange,
  range,
  unit = "px",
  hint,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  range: readonly [number, number];
  unit?: string;
  hint?: string;
}) {
  return (
    <div className="grid gap-1.5">
      <Label className="flex justify-between">
        {label}
        <span className="font-mono text-xs text-muted-foreground">
          {value === 0 && hint ? hint : `${value} ${unit}`}
        </span>
      </Label>
      <input
        type="range"
        min={range[0]}
        max={range[1]}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-9 w-full cursor-pointer accent-primary"
      />
    </div>
  );
}

/** Company branding for email signatures: template, logo, text lines, divider line and style, with a live preview. */
export function BrandCard({ brand, version, sample }: { brand: Brand; version: number; sample: { name: string; email: string } }) {
  const { hasLogo: savedLogo, ...initial } = brand;
  const [f, setF] = useState<Form>(initial);
  // undefined = keep the saved logo, "remove" = delete it, otherwise a data URL picked just now
  const [logo, setLogo] = useState<string | undefined>(undefined);
  const [pending, start] = useTransition();
  const file = useRef<HTMLInputElement>(null);

  const hasLogo = logo === "remove" ? false : logo ? true : savedLogo;
  const logoSrc = logo && logo !== "remove" ? logo : `/api/brand/logo?v=${version}`;
  const corporate = f.template === "corporate";

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
        const style = Object.fromEntries(STYLE_KEYS.map((k) => [k, f[k]])) as unknown as BrandStyle;
        const { company, tagline, address, website, mainPhone, layout, color, disclaimer } = f;
        await saveBrand({ company, tagline, address, website, mainPhone, layout, color, disclaimer, style, ...(logo ? { logo } : {}) });
        toast.success("Branding saved");
        setLogo(undefined);
      } catch (e) {
        toast.error((e as Error).message);
      }
    });

  const put = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }));
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => put(k, e.target.value as never);
  const text = (k: keyof Form, label: string, placeholder?: string, hint?: string) => (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      <Input value={f[k] as string} onChange={set(k)} placeholder={placeholder} />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
  const area = (k: keyof Form, label: string, placeholder?: string, hint?: string) => (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      <Textarea value={f[k] as string} onChange={set(k)} placeholder={placeholder} rows={2} />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
  const check = (k: "showPerson" | "footerLine", label: string) => (
    <label className="flex items-center gap-2 text-sm">
      <Checkbox checked={f[k]} onCheckedChange={(v) => put(k, !!v)} /> {label}
    </label>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Email branding</CardTitle>
        <CardDescription>
          Every user&apos;s email signature is built from this, plus their own name, title and phone (set under My account).
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 lg:grid-cols-2">
        <div className="grid content-start gap-4">
          <div className="flex flex-wrap items-end gap-2">
            <div className="grid min-w-56 flex-1 gap-1.5">
              <Label>Template</Label>
              <NativeSelect value={f.template} onChange={(e) => put("template", e.target.value as Template)}>
                {(Object.keys(TEMPLATE_LABELS) as Template[]).map((k) => (
                  <NativeSelectOption key={k} value={k}>
                    {TEMPLATE_LABELS[k]}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setF((p) => ({ ...p, ...ZERONIX_SAMPLE }));
                toast.info("Zeronix signature loaded. Check the preview, then Save branding.");
              }}
            >
              <Sparkles /> Load Zeronix signature
            </Button>
          </div>

          <Tabs defaultValue="content">
            <TabsList>
              <TabsTrigger value="content">
                <Type /> Content
              </TabsTrigger>
              <TabsTrigger value="contact">
                <Phone /> Contact & footer
              </TabsTrigger>
              <TabsTrigger value="style">
                <Palette /> Line & style
              </TabsTrigger>
            </TabsList>

            <TabsContent value="content" className="grid gap-3 pt-2">
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
                <p className="text-xs text-muted-foreground">PNG, JPG or WebP, under 400 KB, about 300 px wide.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {text("company", "Company name", "ZERONIX TECHNOLOGY LLC")}
                {text("tagline", "Tagline", "Your Trusted Partner in IT Products…")}
              </div>
              {corporate && (
                <>
                  {area("services", "Services line", "IT Hardware | Networking | Servers & Storage | …")}
                  {area("partners", "Partners line", "Authorized Business Partners: Dell • HP • Lenovo", "Text before the first “:” is shown in bold.")}
                  {check("showPerson", "Show the sender's name, title and numbers above the company block")}
                </>
              )}
            </TabsContent>

            <TabsContent value="contact" className="grid gap-3 pt-2">
              {corporate && text("contactHeading", "Contact heading (underlined)", "Contact Us", "Leave empty to hide the heading.")}
              {area("address", "Address", "Office 19, Khurram Building, Al Fahidi, Bur Dubai, UAE")}
              <div className="grid gap-3 sm:grid-cols-2">
                {text("mainPhone", "Company phone(s)", "+971 50 981 1669 | +971 55 824 6066", "Separate several with |")}
                {corporate
                  ? text("emails", "Company email(s)", "sales@zeronix.ae | info@zeronix.ae", "Separate several with |")
                  : null}
                {text("website", "Website", "www.zeronix.ae")}
              </div>
              {text("slogan", "Slogan", "Empowering Businesses Through Smarter Technology.")}
              {area("disclaimer", "Confidentiality notice", "Confidentiality Notice: This email and any attachments…", "Text before the first “:” is shown in bold.")}
              {text("greenNote", "Bottom note", "🌱 Think Green — Please consider the environment before printing this email.")}
            </TabsContent>

            <TabsContent value="style" className="grid gap-4 pt-2">
              <fieldset className="grid gap-3 rounded-lg border p-3">
                <legend className="px-1 text-sm font-medium">Divider line</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  <RangeField label="Thickness" value={f.lineWeight} onChange={(v) => put("lineWeight", v)} range={LIMITS.lineWeight} hint="No line" />
                  <div className="grid gap-1.5">
                    <Label>Line style</Label>
                    <NativeSelect value={f.lineStyle} onChange={(e) => put("lineStyle", e.target.value as LineStyle)}>
                      {(Object.keys(LINE_STYLE_LABELS) as LineStyle[]).map((k) => (
                        <NativeSelectOption key={k} value={k}>
                          {LINE_STYLE_LABELS[k]}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </div>
                  <ColorField
                    label="Line colour"
                    value={f.lineColor}
                    onChange={(v) => put("lineColor", v)}
                    fallback={f.color}
                    emptyLabel="Same as accent"
                  />
                </div>
                {corporate && check("footerLine", "Also draw a line above the confidentiality notice")}
              </fieldset>

              <fieldset className="grid gap-3 rounded-lg border p-3">
                <legend className="px-1 text-sm font-medium">Colours</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  <ColorField label="Accent (company name, title, labels)" value={f.color} onChange={(v) => put("color", v)} fallback="#2a78d6" />
                  <ColorField label="Main text" value={f.textColor} onChange={(v) => put("textColor", v)} fallback="#333333" />
                  <ColorField label="Secondary text (services, notice)" value={f.mutedColor} onChange={(v) => put("mutedColor", v)} fallback="#666666" />
                  <ColorField label="Bottom note" value={f.noteColor} onChange={(v) => put("noteColor", v)} fallback="#2e7d32" />
                </div>
              </fieldset>

              <fieldset className="grid gap-3 rounded-lg border p-3">
                <legend className="px-1 text-sm font-medium">Text & logo</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label>Font</Label>
                    <NativeSelect value={f.font} onChange={(e) => put("font", e.target.value as FontKey)}>
                      {(Object.keys(FONTS) as FontKey[]).map((k) => (
                        <NativeSelectOption key={k} value={k}>
                          {FONTS[k].label}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </div>
                  <RangeField label="Text size" value={f.fontSize} onChange={(v) => put("fontSize", v)} range={LIMITS.fontSize} />
                  <div className="grid gap-1.5">
                    <Label>Logo position</Label>
                    <NativeSelect value={f.layout} onChange={(e) => put("layout", e.target.value as Layout)}>
                      {(Object.keys(LAYOUT_LABELS) as Layout[]).map((k) => (
                        <NativeSelectOption key={k} value={k}>
                          {LAYOUT_LABELS[k]}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </div>
                  <RangeField label="Logo width" value={f.logoWidth} onChange={(v) => put("logoWidth", v)} range={LIMITS.logoWidth} />
                </div>
              </fieldset>
            </TabsContent>
          </Tabs>

          <Button className="w-fit" pending={pending} disabled={!f.company.trim()} onClick={save}>
            Save branding
          </Button>
        </div>
        <div className="grid content-start gap-2 lg:sticky lg:top-4 lg:self-start">
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
