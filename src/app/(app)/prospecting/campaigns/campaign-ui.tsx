"use client";

import { Ban, Pause, Play, Send, Square } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { EnrollResult } from "@/lib/prospecting/outreach";
import { addToCampaign, createCampaign, setCampaignStatus, stopEnrollment, updateCampaign } from "../outreach-actions";
import { useRun } from "../prospect-ui";

export interface Option {
  id: number;
  name: string;
}

/** New campaign, or edit one: its name, the sequence it sends and the mailboxes it sends from. */
export function CampaignDialog({
  campaign,
  sequences,
  mailboxes,
  trigger,
}: {
  campaign?: { id: number; name: string; sequenceId: number; mailboxIds: number[] };
  sequences: Option[];
  mailboxes: (Option & { enabled: boolean })[];
  trigger: React.ReactElement;
}) {
  const router = useRouter();
  const blank = { name: "", sequenceId: sequences[0]?.id ?? 0, mailboxIds: [] as number[] };
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(campaign ?? blank);
  const [pending, run] = useRun();
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setF(campaign ?? blank);
      }}
    >
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{campaign ? "Edit campaign" : "New campaign"}</DialogTitle>
          <DialogDescription>Add prospects from the Prospects list; their first emails then wait in Review for approval.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(
              async () => {
                const data = { name: f.name, sequenceId: f.sequenceId, mailboxIds: f.mailboxIds };
                if (campaign) return updateCampaign(campaign.id, data);
                const res = await createCampaign(data);
                if (res.value) router.push(`/prospecting/campaigns/${res.value}`);
                return res;
              },
              campaign ? "Campaign saved" : "Campaign created",
              () => setOpen(false),
            );
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="cp-name">Name</Label>
            <Input id="cp-name" autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="New Meydan companies, November" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="cp-seq">Sequence</Label>
            <NativeSelect className="w-full" id="cp-seq" value={String(f.sequenceId)} onChange={(e) => setF({ ...f, sequenceId: Number(e.target.value) })}>
              {sequences.map((s) => (
                <NativeSelectOption key={s.id} value={String(s.id)}>
                  {s.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className="grid gap-1.5">
            <span className="text-sm font-medium">Send from</span>
            {mailboxes.map((m) => (
              <label key={m.id} className="flex items-center gap-2 text-sm">
                <Checkbox checked={f.mailboxIds.includes(m.id)} onCheckedChange={(v) => setF({ ...f, mailboxIds: v ? [...f.mailboxIds, m.id] : f.mailboxIds.filter((x) => x !== m.id) })} />
                {m.name}
                {!m.enabled && <span className="text-xs text-muted-foreground">(sending off)</span>}
              </label>
            ))}
            <span className="text-xs text-muted-foreground">{mailboxes.length ? "None ticked = every mailbox that is switched on, in turn." : "No sending mailboxes yet: add them in Settings."}</span>
          </div>
          <Button type="submit" pending={pending} disabled={f.name.trim().length < 2 || !f.sequenceId}>
            {campaign ? "Save" : "Create campaign"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CampaignStatusButtons({ id, status }: { id: number; status: string }) {
  const [pending, run] = useRun();
  if (status === "finished") return <span className="text-xs text-muted-foreground">Finished</span>;
  return (
    <div className="flex items-center gap-1">
      {status === "paused" ? (
        <Button variant="outline" size="sm" pending={pending} onClick={() => run(() => setCampaignStatus(id, "active"), "Campaign resumed")}>
          <Play /> Resume
        </Button>
      ) : (
        <Button variant="outline" size="sm" pending={pending} onClick={() => run(() => setCampaignStatus(id, "paused"), "Campaign paused: nothing is sent until you resume")}>
          <Pause /> Pause
        </Button>
      )}
      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() => confirm("Finish this campaign? Everyone still in it stops getting emails. This cannot be undone.") && run(() => setCampaignStatus(id, "finished"), "Campaign finished")}
      >
        <Square /> Finish
      </Button>
    </div>
  );
}

export function StopEnrollmentButton({ id, name }: { id: number; name: string }) {
  const [pending, run] = useRun();
  return (
    <Button variant="ghost" size="icon-sm" aria-label={`Stop emails to ${name}`} title="Stop emails to this person" pending={pending} onClick={() => confirm(`Stop all emails to ${name}?`) && run(() => stopEnrollment(id), "Stopped")}>
      <Ban />
    </Button>
  );
}

/** Reloads the page every few seconds while AI is writing or emails are going out, so progress shows by itself. */
export function RefreshWhile({ seconds }: { seconds: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds]);
  return null;
}

/** Bulk action on the Prospects list: put the main contact of each selected prospect into a campaign. */
export function AddToCampaign({ ids, campaigns, onDone }: { ids: number[]; campaigns: Option[]; onDone?: () => void }) {
  const [result, setResult] = useState<EnrollResult | null>(null);
  const [pending, run] = useRun();
  if (!campaigns.length)
    return (
      <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/prospecting/campaigns" />}>
        <Send /> Make a campaign first
      </Button>
    );
  return (
    <>
      <NativeSelect
        size="sm"
        aria-label="Add to campaign"
        value=""
        disabled={pending || !ids.length}
        onChange={(e) => {
          const cid = Number(e.target.value);
          if (!cid) return;
          run(
            async () => {
              const res = await addToCampaign(cid, ids);
              if (res.value) setResult(res.value);
              return res;
            },
            "Added to the campaign",
          );
        }}
      >
        <NativeSelectOption value="">Add to campaign</NativeSelectOption>
        {campaigns.map((c) => (
          <NativeSelectOption key={c.id} value={String(c.id)}>
            {c.name}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      {/* onDone runs when this closes: it usually clears the selection, which unmounts this component and the dialog with it. */}
      <Dialog
        open={!!result}
        onOpenChange={(o) => {
          if (o) return;
          setResult(null);
          onDone?.();
        }}
      >
        <DialogContent className="max-h-[80svh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {result?.added ?? 0} added, {result?.skipped.length ?? 0} skipped
            </DialogTitle>
            <DialogDescription>{result?.added ? "Their first emails are waiting in Review." : "Nobody could be added. The reasons are below."}</DialogDescription>
          </DialogHeader>
          {!!result?.skipped.length && (
            <ul className="grid gap-1 text-sm">
              {result.skipped.map((s, i) => (
                <li key={i}>
                  <span className="font-medium">{s.name}</span> <span className="text-muted-foreground">· {s.reason}</span>
                </li>
              ))}
            </ul>
          )}
          {!!result?.added && (
            <Button nativeButton={false} render={<Link href="/prospecting/review" />}>
              Open Review
            </Button>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
