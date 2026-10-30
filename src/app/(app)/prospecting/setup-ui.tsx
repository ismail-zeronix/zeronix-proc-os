"use client";

import { Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { SUPPRESSION_REASONS } from "@/lib/prospecting/constants";
import { addSuppression, createSource, removeSuppression, updateSegment, updateSource, type SourceInput } from "./actions";
import { useRun } from "./prospect-ui";

export const ACCESS_LABELS: Record<string, string> = {
  scrape: "Scraper may read it",
  api: "Official API only",
  manual: "People only",
  import: "File import",
};

export type SourceData = Required<SourceInput> & { id?: number };
const blankSource: SourceData = { name: "", url: "", access: "manual", segmentKey: "", notes: "", termsCheckedAt: "", enabled: true };

export function SourceDialog({ source, segments, trigger }: { source?: SourceData; segments: { key: string; label: string }[]; trigger: React.ReactElement }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<SourceData>(source ?? blankSource);
  const [pending, run] = useRun();
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setF(source ?? blankSource);
      }}
    >
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{source ? "Edit source" : "Add source"}</DialogTitle>
          <DialogDescription>Before the scraper may read a site, read its terms of use and robots.txt, and enter the date you checked.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const { id, ...data } = f;
            void id;
            run(() => (source?.id ? updateSource(source.id, data) : createSource(data)), source ? "Source updated" : "Source added", () => setOpen(false));
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="so-name">Name</Label>
            <Input id="so-name" autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="so-url">Link</Label>
            <Input id="so-url" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} placeholder="https://..." />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="so-acc">How we use it</Label>
              <NativeSelect className="w-full" id="so-acc" value={f.access} onChange={(e) => setF({ ...f, access: e.target.value as SourceData["access"] })}>
                {Object.entries(ACCESS_LABELS).map(([k, l]) => (
                  <NativeSelectOption key={k} value={k}>
                    {l}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="so-terms">Terms checked on</Label>
              <Input id="so-terms" type="date" value={f.termsCheckedAt} onChange={(e) => setF({ ...f, termsCheckedAt: e.target.value })} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="so-seg">Mostly feeds</Label>
            <NativeSelect className="w-full" id="so-seg" value={f.segmentKey} onChange={(e) => setF({ ...f, segmentKey: e.target.value })}>
              <NativeSelectOption value="">Several segments</NativeSelectOption>
              {segments.map((s) => (
                <NativeSelectOption key={s.key} value={s.key}>
                  {s.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="so-notes">Notes</Label>
            <Textarea id="so-notes" rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="What it lists, how often, any limits in its terms" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={f.enabled} onCheckedChange={(v) => setF({ ...f, enabled: !!v })} /> In use
          </label>
          <Button type="submit" pending={pending} disabled={f.name.trim().length < 2}>
            {source ? "Save" : "Add source"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function SegmentDialog({ segment, trigger }: { segment: { key: string; label: string; offer: string; keyRoles: string[]; active: boolean }; trigger: React.ReactElement }) {
  const [open, setOpen] = useState(false);
  const init = { label: segment.label, offer: segment.offer, roles: segment.keyRoles.join(", "), active: segment.active };
  const [f, setF] = useState(init);
  const [pending, run] = useRun();
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setF(init);
      }}
    >
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit segment</DialogTitle>
          <DialogDescription>Who we target, what we offer them and who to find there.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const keyRoles = f.roles
              .split(",")
              .map((r) => r.trim())
              .filter(Boolean);
            run(() => updateSegment(segment.key, { label: f.label, offer: f.offer, keyRoles, active: f.active }), "Segment saved", () => setOpen(false));
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="sg-label">Name</Label>
            <Input id="sg-label" value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="sg-offer">What we offer them</Label>
            <Textarea id="sg-offer" rows={2} value={f.offer} onChange={(e) => setF({ ...f, offer: e.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="sg-roles">People to find (best first, commas between)</Label>
            <Input id="sg-roles" value={f.roles} onChange={(e) => setF({ ...f, roles: e.target.value })} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={f.active} onCheckedChange={(v) => setF({ ...f, active: !!v })} /> In use
          </label>
          <Button type="submit" pending={pending} disabled={f.label.trim().length < 2}>
            Save
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function SuppressionForm() {
  const [value, setValue] = useState("");
  const [reason, setReason] = useState<string>("manual");
  const [note, setNote] = useState("");
  const [pending, run] = useRun();
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => addSuppression({ value, reason, note }), "Blocked", () => {
          setValue("");
          setNote("");
        });
      }}
    >
      <div className="grid gap-1">
        <Label htmlFor="sup-v" className="text-xs">
          Email or domain
        </Label>
        <Input id="sup-v" className="h-8 w-64" value={value} onChange={(e) => setValue(e.target.value)} placeholder="name@company.ae or company.ae" />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="sup-r" className="text-xs">
          Why
        </Label>
        <NativeSelect size="sm" id="sup-r" value={reason} onChange={(e) => setReason(e.target.value)}>
          {SUPPRESSION_REASONS.map((r) => (
            <NativeSelectOption key={r} value={r}>
              {r[0].toUpperCase() + r.slice(1)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      <div className="grid gap-1">
        <Label htmlFor="sup-n" className="text-xs">
          Note
        </Label>
        <Input id="sup-n" className="h-8 w-56" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <Button type="submit" size="sm" pending={pending} disabled={value.trim().length < 3}>
        Block
      </Button>
    </form>
  );
}

export function RemoveSuppressionButton({ id, value }: { id: number; value: string }) {
  const [pending, run] = useRun();
  return (
    <Button variant="ghost" size="icon-sm" aria-label={`Unblock ${value}`} title="Unblock" pending={pending} onClick={() => confirm(`Allow emails to ${value} again?`) && run(() => removeSuppression(id), "Unblocked")}>
      <Trash2 />
    </Button>
  );
}
