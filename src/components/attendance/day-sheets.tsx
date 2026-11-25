"use client";

import { ArrowRight, CalendarClock } from "lucide-react";
import { useState } from "react";
import { formatFollowUp } from "@/components/quick-log";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { EndOfDaySheet, StartOfDaySheet } from "@/lib/daily-report";

const dayFmt = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" });
const dayLabel = (day: string) => dayFmt.format(new Date(`${day}T00:00:00Z`));

function Num({ label, value, target, sub, week }: { label: string; value: number; target?: number; sub?: string; week?: boolean }) {
  // amber only for the daily targets: a weekly one is still open at the end of a day
  const short = !week && target != null && value < target;
  return (
    <div className="grid content-start gap-0.5 bg-card px-2.5 py-2">
      <div className="truncate text-[11px] text-muted-foreground">{label}</div>
      <div className={`text-base leading-none font-semibold tabular-nums ${short ? "text-amber-700 dark:text-amber-400" : ""}`}>
        {value}
        {target != null && <span className="text-xs font-normal text-muted-foreground">/{target}</span>}
      </div>
      {sub && <div className="truncate text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

export interface ReportForm {
  note: string;
  behindReason: string;
  move: boolean;
}

/** Punch-out step 1 for the sales team: the day's numbers (filled in), leftovers, a note. Sending it punches out. */
export function EndOfDayDialog({
  sheet,
  pending,
  onCancel,
  onSubmit,
}: {
  sheet: EndOfDaySheet;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (f: ReportForm) => void;
}) {
  const [note, setNote] = useState("");
  const [why, setWhy] = useState("");
  const [move, setMove] = useState(true);
  const c = sheet.counts;
  const t = c.targets;
  const valid = note.trim().length >= 5 && (!sheet.missed.length || why.trim().length >= 3);

  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent data-punch-dialog className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>End-of-day report</DialogTitle>
          <DialogDescription>Your numbers are filled in. Add a few lines, then you are punched out. The owner sees it tonight.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) onSubmit({ note, behindReason: why, move });
          }}
        >
          <div className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border bg-border">
            <Num label="Calls" value={c.calls} target={t.callsDay} sub={`${c.reached} talked`} />
            <Num label="Messages · meetings" value={c.messages + c.meetings} sub={`${c.messages} sent · ${c.meetings} met`} />
            <Num label="New prospects" value={c.prospectsAdded} target={t.prospectsDay} />
            <Num label="Leads this week" value={c.leadsWeek} target={t.leadsWeek} week />
            <Num label="Quotes this week" value={c.quotesWeek} target={t.quotesWeek} week />
            <Num label="Follow-ups left" value={sheet.left.length} sub={sheet.left.length ? "still due today" : "all done"} />
          </div>

          {sheet.left.length > 0 && (
            <div className="grid gap-1.5 rounded-lg border p-2.5">
              <ul className="grid gap-0.5 text-xs">
                {sheet.left.slice(0, 4).map((l) => (
                  <li key={l.dealId} className="truncate">
                    <span className="font-medium">{l.title}</span> <span className="text-muted-foreground">· {l.company}</span>
                  </li>
                ))}
                {sheet.left.length > 4 && <li className="text-muted-foreground">and {sheet.left.length - 4} more</li>}
              </ul>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={move} onCheckedChange={(v) => setMove(!!v)} />
                <span>
                  Move {sheet.left.length === 1 ? "it" : `all ${sheet.left.length}`} to {formatFollowUp(sheet.moveTo)}
                </span>
              </label>
            </div>
          )}

          <div className="grid gap-1.5">
            <Label htmlFor="eod-note">Your day in a few lines</Label>
            <Textarea
              id="eod-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="What moved, who is close to buying, anything stuck or where you need help"
            />
          </div>

          {sheet.missed.length > 0 && (
            <div className="grid gap-1.5">
              <Label htmlFor="eod-why">Why were today&apos;s targets missed? ({sheet.missed.join(", ")})</Label>
              <Input id="eod-why" value={why} onChange={(e) => setWhy(e.target.value)} maxLength={500} placeholder="A few words" />
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCancel}>
              Not yet
            </Button>
            <Button type="submit" pending={pending} disabled={!valid}>
              Send and punch out
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** After punching in, for the sales team: how the last day went, today's targets, how long today's list is. */
export function StartOfDayDialog({ sheet, onOpen, onClose }: { sheet: StartOfDaySheet; onOpen: () => void; onClose: () => void }) {
  const t = sheet.targets;
  const rows: { label: string; n: number; red?: boolean }[] = [
    { label: "Overdue follow-ups", n: sheet.overdue, red: true },
    { label: "Follow-ups due today", n: sheet.today },
    { label: "New leads to contact", n: sheet.newLeads },
    { label: "Quotes waiting for an answer", n: sheet.quotes },
    { label: "Prospects on your call list", n: sheet.callList },
  ];
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-punch-dialog className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Plan your day, {sheet.name.split(" ")[0]}</DialogTitle>
          <DialogDescription>
            Today: {t.callsDay} calls and {t.prospectsDay} new prospects. This week: {t.leadsWeek} new leads and {t.quotesWeek} quotes sent.
          </DialogDescription>
        </DialogHeader>
        {sheet.last && (
          <div className="grid gap-1 rounded-lg border bg-muted/40 p-2.5 text-sm">
            <div className="text-xs text-muted-foreground">Your last report ({dayLabel(sheet.last.day)})</div>
            <div>
              {sheet.last.calls} calls ({sheet.last.reached} talked) · {sheet.last.prospectsAdded} new prospects
            </div>
            {sheet.last.note && <div className="line-clamp-2 text-xs text-muted-foreground italic">“{sheet.last.note}”</div>}
          </div>
        )}
        <ul className="grid gap-px overflow-hidden rounded-lg border bg-border text-sm">
          {rows.map((r) => (
            <li key={r.label} className="flex items-center justify-between gap-3 bg-card px-3 py-1.5">
              <span>{r.label}</span>
              <span className={`font-semibold tabular-nums ${r.red && r.n ? "text-red-700 dark:text-red-400" : r.n ? "" : "text-muted-foreground"}`}>{r.n}</span>
            </li>
          ))}
        </ul>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <CalendarClock className="size-3.5" aria-hidden /> Start with the overdue ones, then today&apos;s, then new leads.
        </p>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button type="button" onClick={onOpen}>
            Open My Day <ArrowRight />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
