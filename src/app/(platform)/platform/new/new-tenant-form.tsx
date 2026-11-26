"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createTenantAction } from "../actions";
import { InviteLink } from "../invite-link";

const blank = { name: "", legalName: "", trn: "", emirate: "dubai", adminName: "", adminEmail: "", userLimit: "" };

/** A trial request the form is filled from (approved when the organisation is made). */
export interface FromRequest {
  requestId: number;
  name: string;
  adminName: string;
  adminEmail: string;
  note: string;
}

export function NewTenantForm({ from = null }: { from?: FromRequest | null }) {
  const [f, setF] = useState(from ? { ...blank, name: from.name, adminName: from.adminName, adminEmail: from.adminEmail } : blank);
  const [requestId, setRequestId] = useState(from?.requestId ?? null);
  const [made, setMade] = useState<{ id: number; inviteUrl: string; expiresAt: string; emailedTo: string | null } | null>(null);
  const [pending, start] = useTransition();
  const field = (k: keyof typeof blank, label: string, props: React.ComponentProps<typeof Input> = {}) => (
    <div className="grid gap-1.5">
      <Label htmlFor={`nt-${k}`}>{label}</Label>
      <Input id={`nt-${k}`} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} {...props} />
    </div>
  );
  if (made) {
    return (
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Organisation created</CardTitle>
          <CardDescription>It has the core apps (CRM, Sales, Accounts, Projects, Tasks, Files, Chat). Its first admin joins with this link.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <InviteLink url={made.inviteUrl} expiresAt={made.expiresAt} emailedTo={made.emailedTo} />
          <div className="flex gap-2">
            <Button nativeButton={false} render={<Link href={`/platform/tenants/${made.id}`} />}>
              Open the organisation
            </Button>
            <Button variant="outline" onClick={() => (setMade(null), setF(blank), setRequestId(null))}>
              Create another
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>New organisation</CardTitle>
        <CardDescription>
          A company on this platform, with its own data and a 30-day free trial. UAE (VAT, AED) for now.
          {requestId && from && (
            <span className="mt-1 block text-foreground">
              From a trial request{from.note ? `: ${from.note}` : ""}. Creating it marks the request approved and emails the invitation.
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await createTenantAction({ ...f, userLimit: f.userLimit.trim() ? Number(f.userLimit) : null, requestId });
              if (!r.ok) return void toast.error(r.error);
              setMade({ id: r.id, inviteUrl: r.inviteUrl, expiresAt: new Date(r.expiresAt).toISOString(), emailedTo: r.emailed ? f.adminEmail.trim().toLowerCase() : null });
            });
          }}
        >
          {field("name", "Company name", { required: true, autoFocus: true })}
          {field("legalName", "Legal name (optional)")}
          {field("trn", "TRN (optional, 15 digits)", { inputMode: "numeric" })}
          {field("emirate", "Emirate")}
          {field("adminName", "First admin's name", { required: true })}
          {field("adminEmail", "First admin's email", { type: "email", required: true })}
          {field("userLimit", "User limit (empty = none)", { inputMode: "numeric" })}
          <div className="sm:col-span-2">
            <Button type="submit" pending={pending}>
              Create organisation and invitation
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
