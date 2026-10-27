"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { SignaturePreview } from "@/components/signature-preview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Brand } from "@/lib/signature";
import { saveMyProfile } from "./actions";

/** The user's own signature details, with a live preview in the company style. */
export function SignatureCard({
  brand,
  version,
  name,
  email,
  initial,
}: {
  brand: Brand;
  version: number;
  name: string;
  email: string;
  initial: { jobTitle: string; phone: string; mobile: string };
}) {
  const [f, setF] = useState(initial);
  const [pending, start] = useTransition();
  const save = () =>
    start(async () => {
      try {
        await saveMyProfile(f);
        toast.success("Signature saved");
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="grid content-start gap-3">
        <div className="grid gap-1.5">
          <Label>Name</Label>
          <Input value={name} disabled />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="sig-title">Job title</Label>
          <Input id="sig-title" value={f.jobTitle} onChange={(e) => setF({ ...f, jobTitle: e.target.value })} placeholder="Sales Manager" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="sig-phone">Office phone</Label>
            <Input id="sig-phone" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="+971 4 000 0000" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="sig-mobile">Mobile</Label>
            <Input id="sig-mobile" value={f.mobile} onChange={(e) => setF({ ...f, mobile: e.target.value })} placeholder="+971 50 000 0000" />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Your email is {email}. The logo, address and layout come from the company branding, which an admin sets.
        </p>
        <Button className="w-fit" pending={pending} onClick={save}>
          Save signature
        </Button>
      </div>
      <div className="grid content-start gap-2">
        <Label>Preview</Label>
        <SignaturePreview brand={brand} person={{ name, email, ...f }} logoSrc={`/api/brand/logo?v=${version}`} />
      </div>
    </div>
  );
}
