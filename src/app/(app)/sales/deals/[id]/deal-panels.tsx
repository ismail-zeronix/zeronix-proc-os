"use client";

import { BookOpen, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { TempBadge } from "@/components/sales-bits";
import { Button } from "@/components/ui/button";
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

export function RequirementPanel({ dealId, requirement }: { dealId: number; requirement: string }) {
  const [text, setText] = useState(requirement);
  const [pending, run] = useRun();
  return (
    <div className="grid gap-2">
      <p className="text-xs text-muted-foreground">In their words: models, quantity, specs, delivery date. Anything that matters for the quote.</p>
      <Textarea rows={7} value={text} onChange={(e) => setText(e.target.value)} aria-label="Requirement" />
      <Button className="w-fit" size="sm" disabled={pending || text === requirement} onClick={() => run(() => updateDeal(dealId, { requirement: text }), "Saved")}>
        Save
      </Button>
    </div>
  );
}

export function ChecklistPanel({ dealId, checks }: { dealId: number; checks: Checks }) {
  const [state, setState] = useState<Checks>(checks);
  const [pending, run] = useRun();
  const toggle = (key: keyof Checks, on: boolean) => {
    const next = { ...state, [key]: on };
    setState(next);
    run(() => setChecks(dealId, next as Record<string, boolean>));
  };
  const groups = [
    { key: "ask", title: "Ask the customer" },
    { key: "verify", title: "Check the company" },
    { key: "flag", title: "Warning sign" },
  ] as const;
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <TempBadge checks={state} />
        <span className="text-xs text-muted-foreground">Tick what you have confirmed; the label updates itself.</span>
        <Link href="/knowledge/genuine-lead" className="ml-auto inline-flex items-center gap-1 text-xs underline">
          <BookOpen className="size-3" /> How to check
        </Link>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {groups.map((g) => (
          <div key={g.key} className="grid content-start gap-2">
            <div className="text-xs font-medium text-muted-foreground">{g.title}</div>
            {CHECKS.filter((c) => c.group === g.key).map((c) => (
              <label key={c.key} className="flex items-start gap-2 text-sm" title={c.help}>
                <Checkbox className="mt-0.5" checked={!!state[c.key]} disabled={pending} onCheckedChange={(v) => toggle(c.key, !!v)} />
                <span className="leading-snug">{c.label}</span>
              </label>
            ))}
          </div>
        ))}
      </div>
    </div>
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
      <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Type of activity">
        {ACTIVITY_TYPES.map((t) => (
          <button
            key={t.key}
            type="button"
            role="radio"
            aria-checked={type === t.key}
            onClick={() => setType(t.key)}
            className={`rounded-full border px-2.5 py-0.5 text-xs ${type === t.key ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <Textarea rows={2} value={body} onChange={(e) => setBody(e.target.value)} placeholder={type === "note" ? "Write a note…" : "What was said or agreed?"} aria-label="What happened" />
      <div className="flex flex-wrap items-center gap-2">
        <Label htmlFor="log-follow" className="text-xs text-muted-foreground">
          Follow up on
        </Label>
        <Input id="log-follow" type="date" value={followUp} onChange={(e) => setFollowUp(e.target.value)} className="h-8 w-40" title="Optional. Creates a follow-up task." />
        <Button type="submit" size="sm" className="ml-auto" disabled={pending || !body.trim()}>
          Add to timeline
        </Button>
      </div>
    </form>
  );
}

export function DetailsPanel({
  deal,
  contacts,
}: {
  deal: { id: number; title: string; valueAed: number | null; expectedClose: string | null; source: string; contactId: number | null };
  contacts: { id: number; name: string; jobTitle: string }[];
}) {
  const [f, setF] = useState({
    title: deal.title,
    value: deal.valueAed != null ? String(deal.valueAed) : "",
    expectedClose: deal.expectedClose ?? "",
    source: deal.source,
    contactId: deal.contactId ?? 0,
  });
  const [pending, run] = useRun();
  const save = () => {
    const v = f.value.trim() ? Number(f.value.replace(/,/g, "")) : null;
    if (v !== null && !Number.isFinite(v)) return void toast.error("The value must be a number.");
    run(() => updateDeal(deal.id, { title: f.title, valueAed: v, expectedClose: f.expectedClose, source: f.source, contactId: f.contactId || null }), "Deal updated");
  };
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="grid gap-1.5 sm:col-span-2">
        <Label htmlFor="d-title">Title</Label>
        <Input id="d-title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="d-value">Value (AED)</Label>
        <Input id="d-value" inputMode="decimal" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="d-close">Expected close</Label>
        <Input id="d-close" type="date" value={f.expectedClose} onChange={(e) => setF({ ...f, expectedClose: e.target.value })} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="d-contact">Contact person</Label>
        <NativeSelect className="w-full" id="d-contact" value={f.contactId} onChange={(e) => setF({ ...f, contactId: Number(e.target.value) })}>
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
        <NativeSelect className="w-full" id="d-source" value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })}>
          <NativeSelectOption value="">Not sure</NativeSelectOption>
          {SOURCES.map((s) => (
            <NativeSelectOption key={s} value={s}>
              {s}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      <div className="sm:col-span-2">
        <Button size="sm" disabled={pending || !f.title.trim()} onClick={save}>
          Save details
        </Button>
      </div>
    </div>
  );
}

export function DeleteDealButton({ dealId, title }: { dealId: number; title: string }) {
  const router = useRouter();
  const [pending, run] = useRun();
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className="text-muted-foreground hover:text-destructive"
      aria-label="Delete this deal"
      title="Delete this deal"
      disabled={pending}
      onClick={() =>
        confirm(`Delete "${title}" with its timeline and follow-ups? This cannot be undone.`) && run(() => deleteDeal(dealId), "Deal deleted", () => router.push("/sales/pipeline"))
      }
    >
      <Trash2 />
    </Button>
  );
}
