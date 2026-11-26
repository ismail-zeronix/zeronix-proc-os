"use client";

import { ArrowRight, Globe, Handshake, MessageCircle, Phone, SkipForward } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { logProspectCall } from "@/app/(app)/(home)/my-day-actions";
import { OutcomeChips } from "@/components/quick-log";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { scoreBand } from "@/lib/prospecting/constants";
import type { CallItem, ProspectPersonLite, ReplyRow } from "@/lib/prospecting/work";
import type { CallOutcome } from "@/lib/sales";
import { errorText } from "@/lib/user-error";
import { StatusControl } from "./prospect-ui";
import { convertToLead } from "./work-actions";

const telOf = (p: string) => p.replace(/[^\d+]/g, "");
const waOf = (p: string) => p.replace(/\D/g, "");
const WARM: CallOutcome[] = ["interested", "quote_requested", "meeting_set"];

/** "They are interested": the prospect becomes a CRM lead (company, contact, deal at New). */
export function ConvertDialog({
  companyId,
  name,
  people,
  said = "",
  via,
  open,
  onOpenChange,
  onDone,
}: {
  companyId: number;
  name: string;
  people: ProspectPersonLite[];
  said?: string;
  via: "email" | "call";
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [personId, setPersonId] = useState<string>(people[0] ? String(people[0].id) : "");
  const [title, setTitle] = useState("");
  const [requirement, setRequirement] = useState(said);
  const [pending, start] = useTransition();
  const submit = () =>
    start(async () => {
      const r = await convertToLead(companyId, { personId: personId ? Number(personId) : null, title, requirement, via });
      if (r.error) return void toast.error(r.error);
      toast.success(r.value!.reusedCompany ? `Lead added on the existing customer ${r.value!.reusedCompany}` : "Lead added to the CRM", {
        action: { label: "Open", onClick: () => router.push(`/crm/deals/${r.value!.dealId}`) },
      });
      onOpenChange(false);
      onDone?.();
      router.refresh();
    });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Make {name} a lead</DialogTitle>
          <DialogDescription>Adds the customer, the contact and a new deal to the CRM, yours, with today&apos;s &quot;contact them&quot; task.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          {people.length > 0 && (
            <div className="grid gap-1.5">
              <Label htmlFor="cv-person">Contact person</Label>
              <NativeSelect id="cv-person" value={personId} onChange={(e) => setPersonId(e.target.value)}>
                {people.map((p) => (
                  <NativeSelectOption key={p.id} value={String(p.id)}>
                    {[p.name, p.title].filter(Boolean).join(" · ")}
                  </NativeSelectOption>
                ))}
                <NativeSelectOption value="">Nobody yet</NativeSelectOption>
              </NativeSelect>
            </div>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="cv-title">Deal title (optional)</Label>
            <Input id="cv-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} placeholder={`${name} - what they need`} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="cv-req">What they need</Label>
            <Textarea id="cv-req" value={requirement} onChange={(e) => setRequirement(e.target.value)} rows={4} maxLength={4000} placeholder="Items, quantities, timing" />
          </div>
          <DialogFooter>
            <Button type="submit" pending={pending}>
              <Handshake /> Add lead
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** One prospect at a time: call, pick how it went, a note, next. Interested ones become a lead from here. */
export function CallMode({ queue }: { queue: CallItem[] }) {
  const router = useRouter();
  const [list, setList] = useState(queue);
  const [at, setAt] = useState(0);
  const [outcome, setOutcome] = useState<CallOutcome | null>(null);
  const [note, setNote] = useState("");
  const [converting, setConverting] = useState(false);
  const [logged, setLogged] = useState<CallOutcome | null>(null);
  const [pending, start] = useTransition();
  const p = list[at];

  const next = (drop: boolean) => {
    setOutcome(null);
    setNote("");
    setLogged(null);
    if (drop) {
      const rest = list.filter((_, i) => i !== at);
      setList(rest);
      if (at >= rest.length) setAt(0);
      if (!rest.length) router.refresh();
    } else setAt(list.length ? (at + 1) % list.length : 0);
  };

  if (!p)
    return (
      <div className="grid justify-items-start gap-2 rounded-xl border bg-card p-4 text-sm">
        <p className="font-medium">Nobody left to call right now.</p>
        <p className="text-muted-foreground">
          Everyone with a phone has been called in the last 14 days. Add new prospects, or find phone numbers for the ones you have.
        </p>
        <Button nativeButton={false} variant="outline" size="sm" render={<Link href="/prospecting/prospects" />}>
          Prospects <ArrowRight />
        </Button>
      </div>
    );

  const band = scoreBand(p.score);
  const phones = [...(p.phone ? [{ label: "Office", phone: p.phone }] : []), ...p.people.filter((x) => x.phone).map((x) => ({ label: [x.name, x.title].filter(Boolean).join(" · "), phone: x.phone }))];
  const save = () =>
    start(async () => {
      if (!outcome) return;
      try {
        await logProspectCall(p.id, { outcome, body: note });
        toast.success(outcome === "not_interested" ? "Logged and taken off the list" : "Call logged");
        if (WARM.includes(outcome)) setLogged(outcome);
        else next(true);
      } catch (e) {
        toast.error(errorText(e));
      }
    });

  return (
    <div className="grid max-w-3xl gap-3">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {at + 1} of {list.length} to call{list.length >= 25 ? " (more after these)" : ""}
        </span>
        <span>{p.ownerId == null ? "Unassigned: calling makes it yours" : "Yours"}</span>
      </div>
      <section className="grid gap-3 rounded-xl border bg-card p-4">
        <header className="flex flex-wrap items-start gap-x-3 gap-y-1">
          <div className="min-w-0 flex-1">
            <Link href={`/prospecting/prospects/${p.id}`} className="text-lg font-semibold tracking-tight hover:underline">
              {p.name}
            </Link>
            <div className="text-xs text-muted-foreground">{[p.activity, p.industry, p.emirate].filter(Boolean).join(" · ") || "No details yet"}</div>
          </div>
          <span className={`text-sm font-medium ${band.tone}`}>{band.label}</span>
          {p.website && (
            <a href={p.website.startsWith("http") ? p.website : `https://${p.website}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline">
              <Globe className="size-3.5" /> Website
            </a>
          )}
        </header>
        {p.personalLine && <p className="rounded-md bg-muted/60 px-3 py-2 text-sm">Opening line: {p.personalLine}</p>}
        {p.lastNote && <p className="text-xs text-muted-foreground">Last note: {p.lastNote}</p>}
        <ul className="grid gap-1.5">
          {phones.map((x) => (
            <li key={`${x.label}-${x.phone}`} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate">{x.label}</span>
              <Button nativeButton={false} size="sm" render={<a href={`tel:${telOf(x.phone)}`} />}>
                <Phone /> {x.phone}
              </Button>
              <Button nativeButton={false} size="sm" variant="outline" render={<a href={`https://wa.me/${waOf(x.phone)}`} target="_blank" rel="noreferrer" />} aria-label="WhatsApp">
                <MessageCircle />
              </Button>
            </li>
          ))}
        </ul>

        {logged ? (
          <div className="grid gap-2 rounded-md border border-emerald-600/30 bg-emerald-600/5 p-3 text-sm">
            <p>They are interested. Make it a lead now, so the follow-up lives in the CRM.</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => setConverting(true)}>
                <Handshake /> Make it a lead
              </Button>
              <Button size="sm" variant="outline" onClick={() => next(true)}>
                Later, next one
              </Button>
            </div>
          </div>
        ) : (
          <form
            className="grid gap-2 border-t pt-3"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <OutcomeChips value={outcome} onChange={setOutcome} required />
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Notes: who you spoke to, what they use now, when to call back" aria-label="Notes" />
            <div className="flex flex-wrap gap-2">
              <Button type="submit" pending={pending} disabled={!outcome}>
                Save and next
              </Button>
              <Button type="button" variant="ghost" onClick={() => next(false)}>
                <SkipForward /> Skip
              </Button>
            </div>
          </form>
        )}
      </section>
      {/* mounted only while open, so it starts fresh with the call notes each time */}
      {converting && <ConvertDialog companyId={p.id} name={p.name} people={p.people} said={note} via="call" open onOpenChange={setConverting} onDone={() => next(true)} />}
    </div>
  );
}

/** Outreach › Replies: one card per prospect that answered, with what they wrote and what to do next. */
export function ReplyList({ rows, full }: { rows: ReplyRow[]; full: boolean }) {
  const [converting, setConverting] = useState<number | null>(null);
  const active = rows.find((r) => r.id === converting);
  return (
    <>
      <ul className="grid gap-px overflow-hidden rounded-xl border bg-border">
        {rows.map((r) => {
          const phone = r.people.find((x) => x.phone)?.phone || r.phone;
          return (
            <li key={r.id} className="grid gap-2 bg-card px-4 py-3">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <Link href={`/prospecting/prospects/${r.id}`} className="font-medium hover:underline">
                  {r.name}
                </Link>
                <span className="text-xs text-muted-foreground">
                  {[r.industry, r.emirate].filter(Boolean).join(" · ")}
                  {r.campaign && <> · {r.campaign}</>}
                  {full && r.ownerName && <> · {r.ownerName}</>}
                </span>
                <span className="ml-auto text-xs text-muted-foreground" suppressHydrationWarning>
                  {new Date(r.at).toLocaleString("en-GB", { timeZone: "Asia/Dubai", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })}
                </span>
              </div>
              <div className="text-xs text-muted-foreground">{r.headline || "Replied"}</div>
              {r.said ? (
                <blockquote className="border-l-2 pl-3 text-sm whitespace-pre-line">{r.said}</blockquote>
              ) : (
                <p className="text-xs text-muted-foreground">Read the reply in the mailbox it came to.</p>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" onClick={() => setConverting(r.id)}>
                  <Handshake /> Make it a lead
                </Button>
                {phone && (
                  <Button nativeButton={false} size="sm" variant="outline" render={<a href={`tel:${telOf(phone)}`} />}>
                    <Phone /> Call
                  </Button>
                )}
                <StatusControl ids={[r.id]} placeholder="Not a lead…" />
              </div>
            </li>
          );
        })}
      </ul>
      {active && (
        <ConvertDialog
          companyId={active.id}
          name={active.name}
          people={active.people}
          said={active.said}
          via="email"
          open
          onOpenChange={(o) => !o && setConverting(null)}
          onDone={() => setConverting(null)}
        />
      )}
    </>
  );
}
