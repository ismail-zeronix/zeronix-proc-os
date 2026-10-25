"use client";

import { BookOpen, Trash2 } from "lucide-react";
import { AppLink } from "@/components/app-link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { MentionTextarea, useMentionPeople, useMentions } from "@/components/mention-textarea";
import { TempBadge } from "@/components/sales-bits";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { ACTIVITY_TYPES, type Checks, CHECKS, SOURCES } from "@/lib/sales";
import { deleteDeal, logActivity, setAssignees, setChecks, setDealKind, updateDeal } from "../../actions";

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
      <Button className="w-fit" size="sm" pending={pending} disabled={text === requirement} onClick={() => run(() => updateDeal(dealId, { requirement: text }), "Saved")}>
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
        <AppLink href="/knowledge/genuine-lead" className="ml-auto inline-flex items-center gap-1 text-xs underline">
          <BookOpen className="size-3" /> How to check
        </AppLink>
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

/**
 * Log a call, message, email, meeting or note. "@" mentions a teammate: they get a card for this deal in their chat
 * Activity. Mentioning someone who cannot see the deal warns first (and admins can add them to the deal).
 */
export function ActivityForm({ dealId, canAssign, assigneeIds }: { dealId: number; canAssign: boolean; assigneeIds: number[] }) {
  const [type, setType] = useState<string>("call");
  const [body, setBody] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [pending, run] = useRun();
  const mentions = useMentions(`deal:${dealId}`);
  const team = useMentionPeople(`deal:${dealId}`, "cannot see this deal");
  const blocked = team.blocked(mentions.mentioned(body));
  return (
    <form
      className="grid gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(
          () => logActivity(dealId, { type, body: mentions.toTokens(body), followUp }),
          "Added to the timeline",
          () => {
            setBody("");
            setFollowUp("");
            mentions.reset();
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
      <MentionTextarea
        mentions={mentions}
        people={team.people}
        placement="below"
        rows={2}
        value={body}
        onChange={setBody}
        placeholder={type === "note" ? "Write a note… (@ to mention a teammate)" : "What was said or agreed? (@ to mention a teammate)"}
        aria-label="What happened"
        className="field-sizing-content min-h-16 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"
      />
      {blocked.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-800 dark:text-amber-300">
          <span className="flex-1">
            {blocked.map((p) => p.name).join(", ")} cannot see this deal, so they will get a locked card.
          </span>
          {canAssign && (
            <Button
              type="button"
              size="xs"
              variant="outline"
              pending={pending}
              onClick={() => run(() => setAssignees(dealId, [...assigneeIds, ...blocked.map((p) => p.id)]).then(() => team.refetch()), "Added to the deal")}
            >
              Add {blocked.length === 1 ? "them" : "them all"} to the deal
            </Button>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Label htmlFor="log-follow" className="text-xs text-muted-foreground">
          Follow up on
        </Label>
        <Input id="log-follow" type="date" value={followUp} onChange={(e) => setFollowUp(e.target.value)} className="h-8 w-40" title="Optional. Creates a follow-up task." />
        <Button type="submit" size="sm" className="ml-auto" pending={pending} disabled={!body.trim()}>
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
        <Button size="sm" pending={pending} disabled={!f.title.trim()} onClick={save}>
          Save details
        </Button>
      </div>
    </div>
  );
}

/**
 * Product or project deal. Making it a project opens its project in the Projects app (ZPJ-…), where the site work,
 * proposal and handover are tracked; the deal itself stays in this pipeline.
 */
export function KindPanel({
  dealId,
  kind,
  projectType,
  projectTypes,
}: {
  dealId: number;
  kind: "product" | "project";
  projectType: string;
  projectTypes: { key: string; label: string }[];
}) {
  const [k, setK] = useState(kind);
  const [type, setType] = useState(projectType);
  const [pending, run] = useRun();
  const changed = k !== kind || (k === "project" && type !== projectType);
  return (
    <div className="mt-3 grid gap-1.5 border-t pt-3">
      <Label htmlFor="d-kind">Kind of deal</Label>
      <div className="flex flex-wrap items-center gap-2">
        <NativeSelect className="w-40" id="d-kind" value={k} onChange={(e) => setK(e.target.value as "product" | "project")}>
          <NativeSelectOption value="product">Product</NativeSelectOption>
          <NativeSelectOption value="project">Project</NativeSelectOption>
        </NativeSelect>
        {k === "project" && (
          <NativeSelect className="w-52" aria-label="Project type" value={type} onChange={(e) => setType(e.target.value)}>
            <NativeSelectOption value="">Project type…</NativeSelectOption>
            {projectTypes.map((t) => (
              <NativeSelectOption key={t.key} value={t.key}>
                {t.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        )}
        <Button
          size="sm"
          variant="outline"
          pending={pending}
          disabled={!changed || (k === "project" && !type)}
          onClick={() => run(() => setDealKind(dealId, k, type), k === "project" ? "This deal is now a project" : "This deal is now a product deal")}
        >
          Save
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">Projects are site work (CCTV, cabling, server rooms...). They also get a project in the Projects app.</p>
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
      pending={pending}
      onClick={() =>
        confirm(`Delete "${title}" with its timeline and follow-ups? This cannot be undone.`) && run(() => deleteDeal(dealId), "Deal deleted", () => router.replace("/crm/deals"))
      }
    >
      <Trash2 />
    </Button>
  );
}
