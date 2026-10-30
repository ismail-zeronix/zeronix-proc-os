"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { dubaiToday } from "@/lib/dates";
import { MERGE_FIELDS, render, schedule, type MergeVars } from "@/lib/prospecting/outreach-rules";
import { deleteSequence, saveSequence } from "../outreach-actions";
import { useRun } from "../prospect-ui";

interface Step {
  subject: string;
  body: string;
  delayDays: number;
}

/** Example values for the preview, so people see how an email reads before it goes to a real prospect. */
const SAMPLE: MergeVars = {
  first_name: "Sara",
  company: "Acme Trading",
  personal_line: "Congratulations on the new Meydan licence; setting up an office is usually when laptops, Wi-Fi and a website all land at once.",
  offer_line: "new office IT setup: laptops, desktops, network and Wi-Fi, firewall, printer, website",
  signal: "Newly licensed on 12 October",
  sender_first_name: "Sam",
};

const dayName = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

export function SequenceEditor({ sequence, segments }: { sequence?: { id: number; name: string; segmentKey: string; steps: Step[] }; segments: { key: string; label: string }[] }) {
  const router = useRouter();
  const [name, setName] = useState(sequence?.name ?? "");
  const [segmentKey, setSegmentKey] = useState(sequence?.segmentKey ?? "");
  const [steps, setSteps] = useState<Step[]>(sequence?.steps ?? [{ subject: "", body: "Hi {first_name},\n\n{personal_line}\n\n", delayDays: 0 }]);
  const [active, setActive] = useState(0);
  const [pending, run] = useRun();
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const set = (i: number, patch: Partial<Step>) => setSteps(steps.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const insert = (key: string) => {
    const el = bodyRef.current;
    const s = steps[active];
    const at = el ? el.selectionStart : s.body.length;
    set(active, { body: `${s.body.slice(0, at)}{${key}}${s.body.slice(at)}` });
  };
  const move = (i: number, by: number) => {
    const j = i + by;
    if (j < 0 || j >= steps.length) return;
    const next = [...steps];
    [next[i], next[j]] = [next[j], next[i]];
    setSteps(next);
    setActive(j);
  };
  const dates = schedule(dubaiToday(), steps.map((s) => s.delayDays));
  const subject = render(steps[0]?.subject ?? "", SAMPLE).text;

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_24rem]">
      <section className="grid content-start gap-3 rounded-xl border bg-card p-3">
        <div className="grid gap-3 sm:grid-cols-[1fr_16rem]">
          <div className="grid gap-1.5">
            <Label htmlFor="sq-name">Name</Label>
            <Input id="sq-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="New office IT (4 emails)" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="sq-seg">Written for</Label>
            <NativeSelect className="w-full" id="sq-seg" value={segmentKey} onChange={(e) => setSegmentKey(e.target.value)}>
              <NativeSelectOption value="">Any segment</NativeSelectOption>
              {segments.map((s) => (
                <NativeSelectOption key={s.key} value={s.key}>
                  {s.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1">
          <span className="mr-1 text-xs text-muted-foreground">Insert into email {active + 1}:</span>
          {MERGE_FIELDS.map((f) => (
            <Button key={f.key} type="button" variant="outline" size="sm" className="h-6 px-1.5 text-xs" title={f.hint} onClick={() => insert(f.key)}>
              {`{${f.key}}`}
            </Button>
          ))}
        </div>

        {steps.map((s, i) => (
          <div key={i} className={`grid gap-2 rounded-lg border p-3 ${i === active ? "border-ring" : ""}`} onFocus={() => setActive(i)}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">Email {i + 1}</span>
              {i === 0 ? (
                <span className="text-xs text-muted-foreground">starts the thread · {dayName(dates[0])}</span>
              ) : (
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Input type="number" min={1} max={30} className="h-7 w-16" aria-label={`Working days before email ${i + 1}`} value={s.delayDays} onChange={(e) => set(i, { delayDays: Number(e.target.value) || 0 })} />
                  working days later, in the same thread · {dayName(dates[i])}
                </span>
              )}
              <div className="ml-auto flex items-center gap-0.5">
                <Button type="button" variant="ghost" size="icon-sm" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
                  <ArrowUp />
                </Button>
                <Button type="button" variant="ghost" size="icon-sm" aria-label="Move down" disabled={i === steps.length - 1} onClick={() => move(i, 1)}>
                  <ArrowDown />
                </Button>
                <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove email ${i + 1}`} disabled={steps.length === 1} onClick={() => (setSteps(steps.filter((_, j) => j !== i)), setActive(0))}>
                  <Trash2 />
                </Button>
              </div>
            </div>
            {i === 0 && <Input aria-label="Subject" value={s.subject} onChange={(e) => set(i, { subject: e.target.value })} placeholder="Subject: 4-7 words about them, e.g. {company} and your IT setup" />}
            <Textarea ref={i === active ? bodyRef : undefined} rows={7} aria-label={`Email ${i + 1}`} value={s.body} onChange={(e) => set(i, { body: e.target.value })} onFocus={() => setActive(i)} />
            <span className="text-xs text-muted-foreground">{s.body.trim().split(/\s+/).filter(Boolean).length} words. Under 120 reads best. The mailbox signature and an unsubscribe line are added when sending.</span>
          </div>
        ))}

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" disabled={steps.length >= 6} onClick={() => (setSteps([...steps, { subject: "", body: "Hi {first_name},\n\n", delayDays: 3 }]), setActive(steps.length))}>
            <Plus /> Add follow-up
          </Button>
          <Button
            className="ml-auto"
            pending={pending}
            disabled={name.trim().length < 2}
            onClick={() =>
              run(
                async () => {
                  const res = await saveSequence(sequence?.id ?? null, { name, segmentKey, steps });
                  if (res.value && !sequence) router.replace(`/prospecting/sequences/${res.value}`);
                  return res;
                },
                "Sequence saved",
              )
            }
          >
            Save sequence
          </Button>
          {sequence && (
            <Button
              variant="ghost"
              className="text-destructive"
              disabled={pending}
              onClick={() =>
                confirm(`Delete "${sequence.name}"?`) &&
                run(
                  async () => {
                    const res = await deleteSequence(sequence.id);
                    if (!res.error) router.replace("/prospecting/sequences");
                    return res;
                  },
                  "Sequence deleted",
                )
              }
            >
              <Trash2 /> Delete
            </Button>
          )}
        </div>
      </section>

      <aside className="grid content-start gap-2 rounded-xl border bg-card p-3 text-sm lg:sticky lg:top-3">
        <div className="text-xs text-muted-foreground">Preview of email {active + 1} with example values</div>
        <div className="font-medium">{active === 0 ? subject || "(no subject)" : `Re: ${subject}`}</div>
        <div className="whitespace-pre-line">{render(steps[active]?.body ?? "", SAMPLE).text}</div>
        <div className="border-t pt-2 text-xs text-muted-foreground">Sam · Zeronix (mailbox signature)</div>
      </aside>
    </div>
  );
}
