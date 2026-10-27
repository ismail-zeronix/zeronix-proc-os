"use client";

import { ImageUp, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveDocumentBrand } from "./doc-brand-actions";

type Kind = "logoDark" | "signature" | "stamp";

/** One image slot: shows the current picture, lets the admin pick a new one or remove it. Saved with the card. */
function ImageSlot({
  label,
  hint,
  src,
  dark,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  src: string | null;
  dark?: boolean;
  value: string | undefined;
  onChange: (v: string | undefined) => void;
}) {
  const shown = value === "remove" ? null : (value ?? src);
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      <div className={`flex h-24 items-center justify-center rounded-lg border ${dark ? "bg-[#0f1b26]" : "bg-[repeating-conic-gradient(#f4f4f5_0_25%,#fff_0_50%)] bg-[length:16px_16px]"}`}>
        {shown ? (
          // eslint-disable-next-line @next/next/no-img-element -- a preview of an uploaded file or a data URL
          <img src={shown} alt={label} className="max-h-20 max-w-[85%] object-contain" />
        ) : (
          <span className={`text-xs ${dark ? "text-neutral-400" : "text-muted-foreground"}`}>Not uploaded</span>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <label className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-md border px-2 text-xs hover:bg-muted [&_svg]:size-3.5">
          <ImageUp /> Choose…
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              if (f.size > 400 * 1024) return void toast.error(`${label} is over 400 KB. Use a smaller image.`);
              const r = new FileReader();
              r.onload = () => onChange(String(r.result));
              r.readAsDataURL(f);
            }}
          />
        </label>
        {shown && (
          <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove the ${label.toLowerCase()}`} title="Remove" onClick={() => onChange("remove")}>
            <Trash2 />
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

/** Admin > Settings > Documents: what proposals print besides the email brand (contact lines, white logo, signature, stamp). */
export function DocumentBrandCard({
  initial,
}: {
  initial: { docEmail: string; docPhones: string; tradeLicense: string; logoDarkSrc: string | null; signatureSrc: string | null; stampSrc: string | null };
}) {
  const [f, setF] = useState({ docEmail: initial.docEmail, docPhones: initial.docPhones, tradeLicense: initial.tradeLicense });
  const [img, setImg] = useState<Partial<Record<Kind, string>>>({});
  const [pending, start] = useTransition();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <form
      className="grid gap-4 rounded-xl border bg-card p-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          try {
            await saveDocumentBrand({ ...f, ...img });
            setImg({});
            toast.success("Document details saved");
          } catch (err) {
            toast.error((err as Error).message);
          }
        });
      }}
    >
      <div>
        <h2 className="text-sm font-medium">Proposals and customer documents</h2>
        <p className="text-xs text-muted-foreground">Printed on the proposal cover, the quotation header and the signature block. Company name, address, website, main phone and colour come from Email branding.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="grid gap-1.5">
          <Label htmlFor="db-email">Email on documents</Label>
          <Input id="db-email" value={f.docEmail} onChange={set("docEmail")} placeholder="sales@zeronix.ae / info@zeronix.ae" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="db-phones">Phone numbers</Label>
          <Input id="db-phones" value={f.docPhones} onChange={set("docPhones")} placeholder="+971 50 981 1669 / +971 55 824 6066" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="db-licence">Trade licence no.</Label>
          <Input id="db-licence" value={f.tradeLicense} onChange={set("tradeLicense")} placeholder="Optional" />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <ImageSlot label="White logo" hint="For the dark proposal cover. PNG with a transparent background." src={initial.logoDarkSrc} dark value={img.logoDark} onChange={(v) => setImg({ ...img, logoDark: v })} />
        <ImageSlot label="Signature" hint="The authorised signatory's signature, on a transparent background." src={initial.signatureSrc} value={img.signature} onChange={(v) => setImg({ ...img, signature: v })} />
        <ImageSlot label="Company stamp" hint="The round company stamp, on a transparent background." src={initial.stampSrc} value={img.stamp} onChange={(v) => setImg({ ...img, stamp: v })} />
      </div>
      <div>
        <Button type="submit" size="sm" pending={pending}>
          Save document details
        </Button>
      </div>
    </form>
  );
}
