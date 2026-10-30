"use client";

import { Check, ChevronDown, ChevronUp, SkipForward } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { unfilled } from "@/lib/prospecting/outreach-rules";
import { approveDrafts, saveDraft, skipDrafts } from "../outreach-actions";
import { useRun } from "../prospect-ui";

export interface Draft {
  id: number;
  subject: string;
  body: string;
  campaignName: string;
  companyId: number;
  companyName: string;
  personName: string;
  personTitle: string;
  personEmail: string;
  emailStatus: string;
}

/**
 * The review queue: the list on the left, the email on the right, editable. J / K move, A approves, S skips.
 * Approving saves any edits first. Nothing is sent from here: approved emails go to the sending queue.
 */
export function ReviewQueue({ drafts }: { drafts: Draft[] }) {
  const [index, setIndex] = useState(0);
  const [edits, setEdits] = useState<Record<number, { subject: string; body: string }>>({});
  const [pending, run] = useRun();
  const d = drafts[Math.min(index, drafts.length - 1)];
  const cur = d ? (edits[d.id] ?? { subject: d.subject, body: d.body }) : { subject: "", body: "" };
  const left = unfilled(`${cur.subject} ${cur.body}`);
  const words = cur.body.trim().split(/\s+/).filter(Boolean).length;

  const persist = async () => {
    if (!d || !edits[d.id]) return { error: undefined };
    return saveDraft(d.id, edits[d.id]);
  };
  const approve = () =>
    d &&
    run(
      async () => {
        const saved = await persist();
        if (saved.error) return saved;
        const res = await approveDrafts([d.id]);
        if (res.value?.problems.length) return { error: res.value.problems[0] };
        return res;
      },
      "Approved: it goes out within the mailbox's hours",
    );
  const skip = () => d && run(() => skipDrafts([d.id]), "Skipped");
  const approveAll = () =>
    run(
      async () => {
        const res = await approveDrafts(drafts.map((x) => x.id));
        if (res.value?.problems.length) toast.warning(`${res.value.problems.length} not approved: ${res.value.problems.slice(0, 3).join("; ")}${res.value.problems.length > 3 ? "…" : ""}`);
        return res;
      },
      "Approved the emails on this page that were ready",
    );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable]")) return;
      if (e.key === "j") setIndex((i) => Math.min(drafts.length - 1, i + 1));
      else if (e.key === "k") setIndex((i) => Math.max(0, i - 1));
      else if (e.key === "a") approve();
      else if (e.key === "s") skip();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!d) return null;
  return (
    <div className="grid gap-3 lg:grid-cols-[22rem_minmax(0,1fr)]">
      <ul className="grid max-h-[70svh] content-start gap-0.5 overflow-y-auto rounded-xl border bg-card p-1">
        {drafts.map((x, i) => (
          <li key={x.id}>
            <button type="button" onClick={() => setIndex(i)} className={`grid w-full gap-0.5 rounded-md px-2 py-1.5 text-left text-sm ${i === index ? "bg-muted" : "hover:bg-muted/60"}`}>
              <span className="truncate font-medium">{x.companyName}</span>
              <span className="truncate text-xs text-muted-foreground">
                {x.personName} · {x.campaignName}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <section className="grid content-start gap-2 rounded-xl border bg-card p-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Link href={`/prospecting/prospects/${d.companyId}`} className="font-medium hover:underline">
            {d.companyName}
          </Link>
          <span className="text-muted-foreground">
            To {d.personName}
            {d.personTitle && `, ${d.personTitle}`} &lt;{d.personEmail}&gt;
          </span>
          {d.emailStatus !== "verified" && <span className="rounded bg-amber-100 px-1.5 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-300">email {d.emailStatus}</span>}
          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="icon-sm" aria-label="Previous (K)" title="Previous (K)" disabled={index === 0} onClick={() => setIndex(index - 1)}>
              <ChevronUp />
            </Button>
            <span className="text-xs tabular-nums text-muted-foreground">
              {index + 1} / {drafts.length}
            </span>
            <Button variant="ghost" size="icon-sm" aria-label="Next (J)" title="Next (J)" disabled={index >= drafts.length - 1} onClick={() => setIndex(index + 1)}>
              <ChevronDown />
            </Button>
          </div>
        </div>
        <Input aria-label="Subject" value={cur.subject} onChange={(e) => setEdits({ ...edits, [d.id]: { ...cur, subject: e.target.value } })} />
        <Textarea aria-label="Email" rows={12} value={cur.body} onChange={(e) => setEdits({ ...edits, [d.id]: { ...cur, body: e.target.value } })} />
        <div className="text-xs text-muted-foreground">
          {words} words{words > 120 && " · long for a first email"}. The mailbox signature and the unsubscribe line are added when sending; follow-ups go out by themselves until they reply.
        </div>
        {left.length > 0 && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm dark:border-amber-900 dark:bg-amber-950/30">
            Fill in {left.map((f) => `{${f}}`).join(", ")} before approving{left.includes("personal_line") && ": write the personal line on the prospect page, or type it here"}.
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button pending={pending} disabled={left.length > 0} onClick={approve} title="Approve (A)">
            <Check /> Approve
          </Button>
          <Button variant="outline" disabled={pending} onClick={skip} title="Skip (S)">
            <SkipForward /> Skip
          </Button>
          {edits[d.id] && (
            <Button variant="ghost" disabled={pending} onClick={() => run(persist, "Changes saved")}>
              Save changes
            </Button>
          )}
          <Button variant="ghost" className="ml-auto" disabled={pending} onClick={() => confirm(`Approve all ${drafts.length} emails on this page? Ones with a missing field stay here.`) && approveAll()}>
            Approve all on this page
          </Button>
        </div>
      </section>
    </div>
  );
}
