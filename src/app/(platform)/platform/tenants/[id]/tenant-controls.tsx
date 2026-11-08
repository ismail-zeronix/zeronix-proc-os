"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { enterAction, inviteAction, setPlanAction, setStatusAction } from "../../actions";
import { InviteLink } from "../../invite-link";

/** Look inside the organisation: read only by default; changes need a reason the company will see. */
export function EnterBox({ orgId, active }: { orgId: number; active: boolean }) {
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const go = (readOnly: boolean) =>
    start(async () => {
      const r = await enterAction(orgId, readOnly, reason);
      if (r && !r.ok) toast.error(r.error);
    });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Support view</CardTitle>
        <CardDescription>
          Opens the company in this browser as its first admin, for one hour, with a red banner. Every visit is recorded and shown to the company&apos;s admin.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <Textarea placeholder="Why (needed for changes, recorded): e.g. ticket 12, fixing a wrong VAT setting" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={500} />
        <div className="flex flex-wrap gap-2">
          <Button disabled={!active} pending={pending} onClick={() => go(true)}>
            Enter read only
          </Button>
          <Button variant="destructive" disabled={!active || reason.trim().length < 5} pending={pending} onClick={() => go(false)}>
            Enter with changes on
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function StatusBox({ orgId, status }: { orgId: number; status: string }) {
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const next = status === "active" ? "suspended" : "active";
  return (
    <Card>
      <CardHeader>
        <CardTitle>{status === "active" ? "Pause" : "Reactivate"}</CardTitle>
        <CardDescription>{status === "active" ? "Signs everyone in the company out and stops their background jobs. Nothing is deleted." : "Lets the company's people sign in again."}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <Input placeholder="Why (recorded)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
        <Button
          variant={next === "suspended" ? "destructive" : "default"}
          className="w-fit"
          disabled={reason.trim().length < 3}
          pending={pending}
          onClick={() =>
            start(async () => {
              const r = await setStatusAction(orgId, next, reason);
              if (!r.ok) return void toast.error(r.error);
              setReason("");
              toast.success(next === "suspended" ? "Paused." : "Reactivated.");
            })
          }
        >
          {next === "suspended" ? "Pause the company" : "Reactivate"}
        </Button>
      </CardContent>
    </Card>
  );
}

export function PlanBox({ orgId, apps, enabled, userLimit }: { orgId: number; apps: { key: string; label: string }[]; enabled: string[] | null; userLimit: number | null }) {
  const [on, setOn] = useState<Set<string>>(new Set(enabled ?? apps.map((a) => a.key)));
  const [all, setAll] = useState(enabled === null);
  const [limit, setLimit] = useState(userLimit == null ? "" : String(userLimit));
  const [pending, start] = useTransition();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Apps and limit</CardTitle>
        <CardDescription>What the company&apos;s people can use. Admin is always there for their admins.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={all} onCheckedChange={(v) => setAll(!!v)} /> Every app (no plan limits)
        </label>
        {!all && (
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {apps.map((a) => (
              <label key={a.key} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={on.has(a.key)}
                  onCheckedChange={(v) => {
                    const n = new Set(on);
                    if (v) n.add(a.key);
                    else n.delete(a.key);
                    setOn(n);
                  }}
                />
                {a.label}
              </label>
            ))}
          </div>
        )}
        <div className="grid max-w-48 gap-1.5">
          <Label htmlFor="limit">Active users (empty = no limit)</Label>
          <Input id="limit" inputMode="numeric" value={limit} onChange={(e) => setLimit(e.target.value)} />
        </div>
        <Button
          className="w-fit"
          pending={pending}
          onClick={() =>
            start(async () => {
              const r = await setPlanAction(orgId, { apps: all ? null : [...on], userLimit: limit.trim() ? Number(limit) : null });
              if (!r.ok) return void toast.error(r.error);
              toast.success("Saved.");
            })
          }
        >
          Save
        </Button>
      </CardContent>
    </Card>
  );
}

export function InviteBox({ orgId }: { orgId: number }) {
  const [f, setF] = useState({ email: "", name: "", role: "admin" as "admin" | "sales" });
  const [link, setLink] = useState<{ url: string; expiresAt: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Invite someone</CardTitle>
        <CardDescription>A one-time link to join this company (72 hours): for a first admin who lost theirs, or a new person.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {link && <InviteLink url={link.url} expiresAt={link.expiresAt} />}
        <div className="grid gap-2 sm:grid-cols-2">
          <Input placeholder="Email" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          <Input placeholder="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-1.5">
            <input type="radio" checked={f.role === "admin"} onChange={() => setF({ ...f, role: "admin" })} /> Admin
          </label>
          <label className="flex items-center gap-1.5">
            <input type="radio" checked={f.role === "sales"} onChange={() => setF({ ...f, role: "sales" })} /> Staff
          </label>
          <Button
            className="ml-auto"
            pending={pending}
            disabled={!f.email.includes("@")}
            onClick={() =>
              start(async () => {
                const r = await inviteAction(orgId, f);
                if (!r.ok) return void toast.error(r.error);
                setLink({ url: r.url, expiresAt: r.expiresAt });
                setF({ email: "", name: "", role: "admin" });
              })
            }
          >
            Make link
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
