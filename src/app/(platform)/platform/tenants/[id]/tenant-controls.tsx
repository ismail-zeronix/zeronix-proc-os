"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cancelDeletionAction, deleteTenantAction, enterAction, inviteAction, recordPaymentAction, scheduleDeletionAction, setBillingAction, setPlanAction, setStatusAction } from "../../actions";
import { InviteLink } from "../../invite-link";

/**
 * Closing the company: its data as a ZIP first, then (paused) a deletion 30 days ahead that can be cancelled, then the
 * final delete on or after that day. A company nobody ever joined can be deleted at once.
 */
export function CloseBox({
  orgId,
  name,
  paused,
  deleteAfter,
  due,
  nobodyJoined,
}: {
  orgId: number;
  name: string;
  paused: boolean;
  deleteAfter: string | null;
  /** deleteAfter has come */
  due: boolean;
  nobodyJoined: boolean;
}) {
  const [typed, setTyped] = useState("");
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const canDelete = paused && (due || nobodyJoined);
  const nameOk = typed.trim().toLowerCase() === name.trim().toLowerCase();
  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle>Close the company</CardTitle>
        <CardDescription>
          Download its data first. Then, with the company paused, schedule the deletion: 30 days later every record and file is deleted for good with the final button. Until then it can
          be cancelled.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        <a href={`/platform/tenants/${orgId}/export`} className="w-fit font-medium underline">
          Download all its data (ZIP)
        </a>
        {!paused ? (
          <p className="text-muted-foreground">Pause the company first (the Pause card).</p>
        ) : (
          <>
            {deleteAfter && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-destructive">Deletion scheduled from {deleteAfter}.</span>
                <Button
                  size="sm"
                  variant="outline"
                  pending={pending}
                  onClick={() =>
                    start(async () => {
                      const r = await cancelDeletionAction(orgId);
                      if (!r.ok) return void toast.error(r.error);
                      toast.success("Deletion cancelled.");
                    })
                  }
                >
                  Cancel the deletion
                </Button>
              </div>
            )}
            <Input placeholder={`Type the company's name to confirm: ${name}`} value={typed} onChange={(e) => setTyped(e.target.value)} />
            {!deleteAfter && (
              <div className="flex flex-wrap items-center gap-2">
                <Input className="max-w-sm" placeholder="Why (recorded)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={!nameOk || reason.trim().length < 3}
                  pending={pending}
                  onClick={() =>
                    start(async () => {
                      const r = await scheduleDeletionAction(orgId, typed, reason);
                      if (!r.ok) return void toast.error(r.error);
                      setTyped("");
                      toast.success(`Deletion scheduled from ${r.deleteAfter}.`);
                    })
                  }
                >
                  Schedule deletion in 30 days
                </Button>
              </div>
            )}
            {canDelete && (
              <Button
                variant="destructive"
                className="w-fit"
                disabled={!nameOk}
                pending={pending}
                onClick={() =>
                  start(async () => {
                    const r = await deleteTenantAction(orgId, typed);
                    if (r && !r.ok) toast.error(r.error);
                  })
                }
              >
                Delete for good now
              </Button>
            )}
            {canDelete && <p className="text-xs text-destructive">{nobodyJoined && !due ? "Nobody ever joined this company, so it can be deleted now." : "The 30 days are over."} This cannot be undone.</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}

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
          <Checkbox checked={all} onCheckedChange={(v) => setAll(!!v)} /> Every core app
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

/**
 * Billing by manual invoice (lib/billing.ts): record a payment when it arrives (moves "paid until" on and reactivates a
 * company paused for being unpaid), or set the plan, dates and price by hand.
 */
export function BillingBox({
  orgId,
  plan,
  trialEndsOn,
  paidUntil,
  priceMonthly,
  note,
  stateLabel,
  tone,
  pausedUnpaid,
}: {
  orgId: number;
  plan: "trial" | "paid" | "free";
  trialEndsOn: string | null;
  paidUntil: string | null;
  priceMonthly: number | null;
  note: string;
  stateLabel: string;
  tone: "ok" | "warn" | "bad";
  pausedUnpaid: boolean;
}) {
  const [months, setMonths] = useState(1);
  const [reference, setReference] = useState("");
  const [f, setF] = useState({ plan, trialEndsOn: trialEndsOn ?? "", paidUntil: paidUntil ?? "", price: priceMonthly == null ? "" : String(priceMonthly), note });
  const [pending, start] = useTransition();
  const color = tone === "bad" ? "text-destructive" : tone === "warn" ? "text-amber-700 dark:text-amber-400" : "text-foreground";
  return (
    <Card>
      <CardHeader>
        <CardTitle>Billing</CardTitle>
        <CardDescription>Invoice from Zeronix&apos;s own Accounts, then record the payment here. Reminders go to the company&apos;s admins 7, 3 and 1 days before; unpaid, it pauses 7 days after.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className={`text-sm font-medium ${color}`}>
          {stateLabel}
          {pausedUnpaid && <span className="ml-2 rounded bg-destructive/10 px-1.5 py-0.5 text-xs text-destructive">paused: unpaid</span>}
        </div>
        {plan !== "free" && (
          <div className="flex flex-wrap items-end gap-2 rounded-md border p-2">
            <div className="grid gap-1">
              <Label htmlFor="pay-months" className="text-xs">
                Payment received for
              </Label>
              <select id="pay-months" className="h-8 rounded-md border bg-background px-2 text-sm" value={months} onChange={(e) => setMonths(Number(e.target.value))}>
                {[1, 3, 6, 12].map((m) => (
                  <option key={m} value={m}>
                    {m} month{m === 1 ? "" : "s"}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid min-w-40 flex-1 gap-1">
              <Label htmlFor="pay-ref" className="text-xs">
                Reference (invoice number, transfer)
              </Label>
              <Input id="pay-ref" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={200} />
            </div>
            <Button
              pending={pending}
              onClick={() =>
                start(async () => {
                  const r = await recordPaymentAction(orgId, months, reference);
                  if (!r.ok) return void toast.error(r.error);
                  setReference("");
                  setF((x) => ({ ...x, plan: "paid", paidUntil: r.paidUntil }));
                  toast.success(`Paid until ${r.paidUntil}.`);
                })
              }
            >
              Record payment
            </Button>
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1 sm:col-span-2">
            <span className="text-xs text-muted-foreground">Plan</span>
            <div className="flex flex-wrap gap-3 text-sm">
              {(
                [
                  ["trial", "Trial"],
                  ["paid", "Paid"],
                  ["free", "Free (never ends)"],
                ] as const
              ).map(([k, label]) => (
                <label key={k} className="flex items-center gap-1.5">
                  <input type="radio" checked={f.plan === k} onChange={() => setF({ ...f, plan: k })} /> {label}
                </label>
              ))}
            </div>
          </div>
          <div className="grid gap-1">
            <Label htmlFor="b-trial" className="text-xs">
              Trial ends (empty = no end)
            </Label>
            <Input id="b-trial" type="date" value={f.trialEndsOn} onChange={(e) => setF({ ...f, trialEndsOn: e.target.value })} />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="b-paid" className="text-xs">
              Paid until
            </Label>
            <Input id="b-paid" type="date" value={f.paidUntil} onChange={(e) => setF({ ...f, paidUntil: e.target.value })} />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="b-price" className="text-xs">
              Monthly price, AED before VAT (optional)
            </Label>
            <Input id="b-price" inputMode="decimal" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value.replace(/[^\d.]/g, "") })} />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="b-note" className="text-xs">
              Note (only you see it)
            </Label>
            <Input id="b-note" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} maxLength={500} />
          </div>
        </div>
        <Button
          variant="outline"
          className="w-fit"
          pending={pending}
          onClick={() =>
            start(async () => {
              const r = await setBillingAction(orgId, { plan: f.plan, trialEndsOn: f.trialEndsOn || null, paidUntil: f.paidUntil || null, priceMonthly: f.price.trim() ? Number(f.price) : null, note: f.note });
              if (!r.ok) return void toast.error(r.error);
              toast.success("Billing saved.");
            })
          }
        >
          Save billing
        </Button>
      </CardContent>
    </Card>
  );
}

export function InviteBox({ orgId }: { orgId: number }) {
  const [f, setF] = useState({ email: "", name: "", role: "admin" as "admin" | "sales" });
  const [link, setLink] = useState<{ url: string; expiresAt: string; emailedTo: string | null } | null>(null);
  const [pending, start] = useTransition();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Invite someone</CardTitle>
        <CardDescription>A one-time link to join this company (72 hours): for a first admin who lost theirs, or a new person.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {link && <InviteLink url={link.url} expiresAt={link.expiresAt} emailedTo={link.emailedTo} />}
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
                setLink({ url: r.url, expiresAt: r.expiresAt, emailedTo: r.emailed ? f.email.trim().toLowerCase() : null });
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
