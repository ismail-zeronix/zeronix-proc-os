"use client";

import { AlarmClock, CalendarX2, FileText, MessageCircle, Phone, PhoneCall, Sparkles, Timer, UserPlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { logActivity, moveFollowUp } from "@/app/(app)/crm/actions";
import { formatFollowUp, needsNextStep, type NextStep, NextStepPicker, nextStepTime, OutcomeChips, takesOutcome } from "@/components/quick-log";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { WorkHours } from "@/lib/attendance";
import type { DayItem, ItemKind } from "@/lib/my-day";
import type { CallOutcome } from "@/lib/sales";
import { errorText } from "@/lib/user-error";
import { logProspectCall } from "./my-day-actions";

const GROUPS: { kind: ItemKind; label: string; short: string; icon: typeof Phone; tone?: string }[] = [
  { kind: "overdue", label: "Overdue follow-ups", short: "Overdue", icon: AlarmClock, tone: "text-red-700 dark:text-red-400" },
  { kind: "today", label: "Follow up today", short: "Today", icon: Timer },
  { kind: "new_lead", label: "New leads to contact", short: "New leads", icon: Sparkles, tone: "text-amber-700 dark:text-amber-400" },
  { kind: "quote", label: "Quotes waiting for an answer", short: "Quotes", icon: FileText },
  { kind: "no_step", label: "Deals with no next step", short: "No next step", icon: CalendarX2 },
  { kind: "cold", label: "Call list (prospects)", short: "Call list", icon: PhoneCall },
];

const SHOW = 6;
const LOG_TYPES = [
  { key: "call", label: "Call" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "email", label: "Email" },
  { key: "meeting", label: "Meeting" },
] as const;

const digits = (s: string) => s.replace(/[^\d+]/g, "");
const waLink = (s: string) => `https://wa.me/${digits(s).replace(/^\+/, "").replace(/^00/, "")}`;

export function TodayList({ items, hours, moreCold, coldCalls }: { items: DayItem[]; hours: WorkHours; moreCold: boolean; coldCalls: boolean }) {
  const [filter, setFilter] = useState<ItemKind | "all">("all");
  const [open, setOpen] = useState<{ key: string; mode: "log" | "later"; type?: string } | null>(null);
  const [expanded, setExpanded] = useState<Set<ItemKind>>(new Set());
  const groups = GROUPS.map((g) => ({ ...g, items: items.filter((i) => i.kind === g.kind) })).filter((g) => g.items.length || (g.kind === "cold" && coldCalls));
  const shown = groups.filter((g) => filter === "all" || g.kind === filter);

  return (
    <section aria-label="To do today" className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-2 rounded-xl border bg-card p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <h2 className="mr-1 text-sm font-medium">To do now</h2>
        <button type="button" onClick={() => setFilter("all")} className={chip(filter === "all")}>
          All {items.length}
        </button>
        {groups.map((g) => (
          <button key={g.kind} type="button" onClick={() => setFilter(g.kind)} className={chip(filter === g.kind)}>
            {g.short} {g.items.length}
          </button>
        ))}
      </div>

      {!items.length && (
        <p className="rounded-lg bg-muted/50 px-3 py-6 text-center text-sm text-muted-foreground">
          Nothing waiting. Time to find new customers:{" "}
          <Link href="/crm/new" className="underline">
            add a lead
          </Link>
          .
        </p>
      )}

      {shown.map((g) => {
        const all = expanded.has(g.kind);
        const list = all ? g.items : g.items.slice(0, SHOW);
        return (
          <div key={g.kind} className="grid grid-cols-[minmax(0,1fr)] gap-0.5" id={`today-${g.kind}`}>
            <div className={`flex items-center gap-1.5 pt-1 text-xs font-medium ${g.tone ?? "text-muted-foreground"}`}>
              <g.icon className="size-3.5" /> {g.label} <span className="font-normal text-muted-foreground">({g.items.length}{g.kind === "cold" && moreCold ? "+" : ""})</span>
            </div>
            {g.kind === "cold" && !g.items.length && (
              <p className="px-2 py-1 text-xs text-muted-foreground">No prospects to call. Ask your manager to give you a batch in Prospecting.</p>
            )}
            {list.map((i) => (
              <Row key={i.key} item={i} hours={hours} open={open?.key === i.key ? open : null} setOpen={setOpen} />
            ))}
            {g.items.length > SHOW && (
              <button
                type="button"
                className="w-fit px-2 py-0.5 text-xs text-muted-foreground hover:underline"
                onClick={() => setExpanded((s) => (all ? new Set([...s].filter((k) => k !== g.kind)) : new Set(s).add(g.kind)))}
              >
                {all ? "Show fewer" : `Show ${g.items.length - SHOW} more`}
              </button>
            )}
          </div>
        );
      })}
    </section>
  );
}

function chip(on: boolean) {
  return `rounded-full border px-2 py-0.5 text-xs tabular-nums ${on ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"}`;
}

type Open = { key: string; mode: "log" | "later"; type?: string };

function Row({ item: i, hours, open, setOpen }: { item: DayItem; hours: WorkHours; open: Open | null; setOpen: (o: Open | null) => void }) {
  const href = i.dealId ? `/crm/deals/${i.dealId}` : i.quoteId ? `/sales/quotes/${i.quoteId}` : `/prospecting/prospects/${i.prospectId}`;
  const isDeal = !!i.dealId;
  const toggle = (mode: Open["mode"], type?: string) => setOpen(open?.mode === mode && !type ? null : { key: i.key, mode, type });
  return (
    <div className={`rounded-lg ${open ? "bg-muted/60" : "hover:bg-muted/40"}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2 py-1.5">
        <Link href={href} className="min-w-0 flex-1 basis-56">
          <div className="truncate text-sm font-medium">
            {i.title}
            {i.kind !== "cold" && i.company && <span className="font-normal text-muted-foreground"> · {i.company}</span>}
          </div>
          <div className={`truncate text-xs ${i.kind === "overdue" ? "text-red-700 dark:text-red-400" : "text-muted-foreground"}`}>
            {i.contact && <>{i.contact} · </>}
            {i.why}
          </div>
        </Link>
        <div className="flex items-center gap-1">
          {i.phone && (
            <Button
              variant="ghost"
              size="icon-sm"
              nativeButton={false}
              aria-label={`Call ${i.contact || i.company}`}
              title={`Call ${i.phone}`}
              render={<a href={`tel:${digits(i.phone)}`} onClick={() => (isDeal || i.prospectId) && setOpen({ key: i.key, mode: "log", type: "call" })} />}
            >
              <Phone />
            </Button>
          )}
          {(i.whatsapp || (isDeal && i.phone)) && (
            <Button
              variant="ghost"
              size="icon-sm"
              nativeButton={false}
              aria-label="WhatsApp"
              title="Open WhatsApp"
              render={<a href={waLink(i.whatsapp || i.phone)} target="_blank" rel="noreferrer" onClick={() => isDeal && setOpen({ key: i.key, mode: "log", type: "whatsapp" })} />}
            >
              <MessageCircle />
            </Button>
          )}
          {(isDeal || i.prospectId) && (
            <Button variant={open?.mode === "log" ? "secondary" : "outline"} size="xs" onClick={() => toggle("log")}>
              Log
            </Button>
          )}
          {isDeal && (i.kind === "overdue" || i.kind === "today") && (
            <Button variant={open?.mode === "later" ? "secondary" : "ghost"} size="xs" onClick={() => toggle("later")} title="Move this follow-up (needs a reason)">
              Later
            </Button>
          )}
        </div>
      </div>
      {open?.mode === "log" && isDeal && <DealLog item={i} hours={hours} type={open.type} done={() => setOpen(null)} />}
      {open?.mode === "log" && i.prospectId && <ProspectLog item={i} done={() => setOpen(null)} />}
      {open?.mode === "later" && isDeal && <MoveLater item={i} hours={hours} done={() => setOpen(null)} />}
    </div>
  );
}

function useSave() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const save = (fn: () => Promise<unknown>, ok: string, after: () => void) =>
    start(async () => {
      try {
        await fn();
        toast.success(ok);
        after();
        router.refresh();
      } catch (e) {
        toast.error(errorText(e));
      }
    });
  return [pending, save] as const;
}

function DealLog({ item: i, hours, type: first, done }: { item: DayItem; hours: WorkHours; type?: string; done: () => void }) {
  const [type, setType] = useState<string>(first ?? "call");
  const [outcome, setOutcome] = useState<CallOutcome | null>(null);
  const [body, setBody] = useState("");
  const [next, setNext] = useState<NextStep>(null);
  const [pending, save] = useSave();
  const withOutcome = takesOutcome(type);
  const needNext = needsNextStep({ type, outcome: withOutcome ? outcome : null, stage: i.stage ?? "", followUpAt: i.followUpAt });
  const ready = (type !== "call" || !!outcome) && (!!body.trim() || (withOutcome && !!outcome)) && (!needNext || !!next);
  return (
    <form
      className="grid gap-2 border-t px-2 py-2"
      onSubmit={(e) => {
        e.preventDefault();
        const when = nextStepTime(next, hours);
        save(
          () => logActivity(i.dealId!, { type, body, outcome: withOutcome ? (outcome ?? undefined) : undefined, followUpAt: when?.toISOString() }),
          when ? `Logged. Next follow-up ${formatFollowUp(when)}` : "Logged",
          () => {
            done();
            if (outcome === "not_interested") toast.info("Not interested: if the deal is over, mark it lost on the deal page.");
          },
        );
      }}
    >
      <div className="flex flex-wrap gap-1.5">
        {LOG_TYPES.map((t) => (
          <button key={t.key} type="button" onClick={() => setType(t.key)} className={chip(type === t.key)}>
            {t.label}
          </button>
        ))}
      </div>
      {withOutcome && <OutcomeChips value={outcome} onChange={setOutcome} required={type === "call"} />}
      <Input value={body} onChange={(e) => setBody(e.target.value)} placeholder={withOutcome ? "What was said (optional once you pick how it went)" : "What was sent or agreed"} aria-label="What happened" className="h-8" />
      <div className="flex flex-wrap items-center gap-2">
        <NextStepPicker value={next} onChange={setNext} hours={hours} required={needNext} existing={i.followUpAt} />
        <Button type="submit" size="sm" className="ml-auto" pending={pending} disabled={!ready}>
          Save
        </Button>
      </div>
    </form>
  );
}

function ProspectLog({ item: i, done }: { item: DayItem; done: () => void }) {
  const [outcome, setOutcome] = useState<CallOutcome | null>(null);
  const [body, setBody] = useState("");
  const [pending, save] = useSave();
  const warm = outcome === "interested" || outcome === "quote_requested" || outcome === "meeting_set";
  return (
    <form
      className="grid gap-2 border-t px-2 py-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!outcome) return;
        save(() => logProspectCall(i.prospectId!, { outcome, body }), outcome === "not_interested" ? "Logged and taken off your call list" : "Call logged", done);
      }}
    >
      <OutcomeChips value={outcome} onChange={setOutcome} required />
      <Input value={body} onChange={(e) => setBody(e.target.value)} placeholder="Notes (optional): who you spoke to, what they use now" aria-label="Notes" className="h-8" />
      <div className="flex flex-wrap items-center gap-2">
        {warm && (
          <Link href="/crm/new" className="inline-flex items-center gap-1 text-xs font-medium text-primary underline">
            <UserPlus className="size-3.5" /> They are interested: add them as a lead
          </Link>
        )}
        <Button type="submit" size="sm" className="ml-auto" pending={pending} disabled={!outcome}>
          Save
        </Button>
      </div>
    </form>
  );
}

function MoveLater({ item: i, hours, done }: { item: DayItem; hours: WorkHours; done: () => void }) {
  const [next, setNext] = useState<NextStep>({ key: "tomorrow" });
  const [reason, setReason] = useState("");
  const [pending, save] = useSave();
  const when = nextStepTime(next, hours);
  return (
    <form
      className="grid gap-2 border-t px-2 py-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!when) return;
        save(() => moveFollowUp(i.dealId!, { followUpAt: when.toISOString(), reason }), `Moved to ${formatFollowUp(when)}`, done);
      }}
    >
      <NextStepPicker value={next} onChange={setNext} hours={hours} required existing={null} />
      <div className="flex flex-wrap items-center gap-2">
        <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why not today? (shows on the deal timeline)" aria-label="Reason" className="h-8 min-w-0 flex-1 basis-60" />
        <Button type="submit" size="sm" pending={pending} disabled={!when || reason.trim().length < 3}>
          Move
        </Button>
      </div>
    </form>
  );
}
