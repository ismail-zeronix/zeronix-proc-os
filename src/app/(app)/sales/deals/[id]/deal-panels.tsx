"use client";

import { BookOpen, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { TempBadge } from "@/components/sales-bits";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { ACTIVITY_TYPES, type Checks, CHECKS, SOURCES } from "@/lib/sales";
import { deleteDeal, logActivity, setChecks, updateDeal } from "../../actions";

function useRun() {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<unknown>, ok?: string, after?: () => void) =>
    start(async () => {
      try {
        await fn();
        if (ok) toast.success(ok);
        after?.();
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  return [pending, run] as const;
}

export function RequirementCard({ dealId, requirement }: { dealId: number; requirement: string }) {
  const [text, setText] = useState(requirement);
  const [pending, run] = useRun();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">What they asked for</CardTitle>
        <CardDescription>In their words: models, quantity, specs, delivery date, anything that matters for the quote.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2">
        <Textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} aria-label="Requirement" />
        <Button className="w-fit" size="sm" variant="outline" disabled={pending || text === requirement} onClick={() => run(() => updateDeal(dealId, { requirement: text }), "Saved")}>
          Save
        </Button>
      </CardContent>
    </Card>
  );
}

export function ChecklistCard({ dealId, checks }: { dealId: number; checks: Checks }) {
  const [state, setState] = useState<Checks>(checks);
  const [pending, run] = useRun();
  const toggle = (key: keyof Checks, on: boolean) => {
    const next = { ...state, [key]: on };
    setState(next);
    run(() => setChecks(dealId, next as Record<string, boolean>));
  };
  const groups = [
    { key: "ask", title: "Ask the customer", note: "Need, authority, budget and timing" },
    { key: "verify", title: "Check the company", note: "Do not rely on what they say alone" },
    { key: "flag", title: "Warning sign", note: "" },
  ] as const;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          Is this lead genuine? <TempBadge checks={state} />
        </CardTitle>
        <CardDescription>
          Tick what you have confirmed. The label updates by itself.{" "}
          <Link href="/knowledge/genuine-lead" className="inline-flex items-center gap-1 underline">
            <BookOpen className="size-3" /> How to check
          </Link>
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        {groups.map((g) => (
          <div key={g.key} className={`grid content-start gap-2 ${g.key === "flag" ? "sm:col-span-2" : ""}`}>
            <div className="text-xs font-medium text-muted-foreground">
              {g.title}
              {g.note && <span className="font-normal"> · {g.note}</span>}
            </div>
            {CHECKS.filter((c) => c.group === g.key).map((c) => (
              <label key={c.key} className="flex items-start gap-2 text-sm">
                <Checkbox className="mt-0.5" checked={!!state[c.key]} disabled={pending} onCheckedChange={(v) => toggle(c.key, !!v)} />
                <span>
                  {c.label}
                  <span className="block text-xs text-muted-foreground">{c.help}</span>
                </span>
              </label>
            ))}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function ActivityForm({ dealId }: { dealId: number }) {
  const [type, setType] = useState<string>("call");
  const [body, setBody] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [pending, run] = useRun();
  return (
    <form
      className="grid gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(
          () => logActivity(dealId, { type, body, followUp }),
          "Added to the timeline",
          () => {
            setBody("");
            setFollowUp("");
          },
        );
      }}
    >
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Type of activity">
        {ACTIVITY_TYPES.map((t) => (
          <button
            key={t.key}
            type="button"
            role="radio"
            aria-checked={type === t.key}
            onClick={() => setType(t.key)}
            className={`rounded-full border px-3 py-1 text-sm ${type === t.key ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <Textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder={type === "note" ? "Write a note…" : "What was said or agreed?"} aria-label="What happened" />
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1">
          <Label htmlFor="log-follow" className="text-xs text-muted-foreground">
            Follow up on (optional, creates a task)
          </Label>
          <Input id="log-follow" type="date" value={followUp} onChange={(e) => setFollowUp(e.target.value)} className="w-44" />
        </div>
        <Button type="submit" disabled={pending || !body.trim()}>
          Add to timeline
        </Button>
      </div>
    </form>
  );
}

export function DetailsCard({
  deal,
  users,
  contacts,
}: {
  deal: { id: number; title: string; valueAed: number | null; expectedClose: string | null; ownerId: number | null; source: string; contactId: number | null };
  users: { id: number; name: string }[];
  contacts: { id: number; name: string; jobTitle: string }[];
}) {
  const [f, setF] = useState({
    title: deal.title,
    value: deal.valueAed != null ? String(deal.valueAed) : "",
    expectedClose: deal.expectedClose ?? "",
    ownerId: deal.ownerId ?? 0,
    source: deal.source,
    contactId: deal.contactId ?? 0,
  });
  const [pending, run] = useRun();
  const save = () => {
    const v = f.value.trim() ? Number(f.value.replace(/,/g, "")) : null;
    if (v !== null && !Number.isFinite(v)) return void toast.error("The value must be a number.");
    run(
      () =>
        updateDeal(deal.id, {
          title: f.title,
          valueAed: v,
          expectedClose: f.expectedClose,
          ownerId: f.ownerId || null,
          source: f.source,
          contactId: f.contactId || null,
        }),
      "Deal updated",
    );
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Deal details</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="d-title">Title</Label>
          <Input id="d-title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="d-value">Value (AED)</Label>
            <Input id="d-value" inputMode="decimal" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="d-close">Expected close</Label>
            <Input id="d-close" type="date" value={f.expectedClose} onChange={(e) => setF({ ...f, expectedClose: e.target.value })} />
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="d-owner">Owner</Label>
          <NativeSelect id="d-owner" value={f.ownerId} onChange={(e) => setF({ ...f, ownerId: Number(e.target.value) })}>
            <NativeSelectOption value={0}>Nobody</NativeSelectOption>
            {users.map((u) => (
              <NativeSelectOption key={u.id} value={u.id}>
                {u.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="d-contact">Contact person</Label>
          <NativeSelect id="d-contact" value={f.contactId} onChange={(e) => setF({ ...f, contactId: Number(e.target.value) })}>
            <NativeSelectOption value={0}>None</NativeSelectOption>
            {contacts.map((c) => (
              <NativeSelectOption key={c.id} value={c.id}>
                {c.name}
                {c.jobTitle ? ` (${c.jobTitle})` : ""}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="d-source">Source</Label>
          <NativeSelect id="d-source" value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })}>
            <NativeSelectOption value="">Not sure</NativeSelectOption>
            {SOURCES.map((s) => (
              <NativeSelectOption key={s} value={s}>
                {s}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <Button className="w-fit" disabled={pending || !f.title.trim()} onClick={save}>
          Save details
        </Button>
      </CardContent>
    </Card>
  );
}

export function DeleteDealButton({ dealId, title }: { dealId: number; title: string }) {
  const router = useRouter();
  const [pending, run] = useRun();
  return (
    <Button
      variant="ghost"
      size="sm"
      className="text-destructive"
      disabled={pending}
      onClick={() => confirm(`Delete "${title}" with its timeline and follow-ups? This cannot be undone.`) && run(() => deleteDeal(dealId), "Deal deleted", () => router.push("/sales"))}
    >
      <Trash2 /> Delete deal
    </Button>
  );
}
