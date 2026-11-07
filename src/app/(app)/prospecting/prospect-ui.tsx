"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { dubaiToday } from "@/lib/dates";
import { DISQUALIFY_REASONS, EMAIL_STATUSES, MANUAL_STATUSES, ROLE_KINDS, SIGNALS, SIZE_BANDS, STATUSES, type StatusKey } from "@/lib/prospecting/constants";
import { EMIRATES, INDUSTRIES } from "@/lib/sales";
import {
  addPerson,
  addProspectNote,
  addSignal,
  createProspect,
  deletePerson,
  deleteProspect,
  deleteSignal,
  savePersonalLine,
  setProspectOwner,
  setProspectStatus,
  updatePerson,
  updateProspect,
  type PersonInput,
  type ProspectInput,
} from "./actions";
import { errorText } from "@/lib/user-error";

/** Runs an action: shows its returned `{ error }` (or a thrown one), otherwise the success message. */
export function useRun() {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ error?: string } | void>, ok: string, after?: () => void) =>
    start(async () => {
      try {
        const res = await fn();
        if (res?.error) return void toast.error(res.error);
        toast.success(ok);
        after?.();
      } catch (e) {
        toast.error(errorText(e));
      }
    });
  return [pending, run] as const;
}

export interface SegmentOption {
  key: string;
  label: string;
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

function Pick({ id, value, onChange, options, none = "Not sure" }: { id: string; value: string; onChange: (v: string) => void; options: readonly (string | { key: string; label: string })[]; none?: string }) {
  return (
    <NativeSelect className="w-full" id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      <NativeSelectOption value="">{none}</NativeSelectOption>
      {options.map((o) => {
        const [k, l] = typeof o === "string" ? [o, o] : [o.key, o.label];
        return (
          <NativeSelectOption key={k} value={k}>
            {l}
          </NativeSelectOption>
        );
      })}
    </NativeSelect>
  );
}

export type ProspectData = Required<Omit<ProspectInput, "sourceUrl">> & { id?: number; sourceUrl: string };

const blankProspect: ProspectData = {
  name: "",
  website: "",
  emirate: "",
  freeZone: "",
  licenseNo: "",
  licenseDate: "",
  activity: "",
  industry: "",
  segmentKey: "",
  sizeBand: "",
  phone: "",
  email: "",
  address: "",
  linkedinUrl: "",
  sourceUrl: "",
  notes: "",
};

/** Add a prospect company, or edit one when `prospect` is given. */
export function ProspectDialog({ prospect, segments, trigger }: { prospect?: ProspectData; segments: SegmentOption[]; trigger: React.ReactElement }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<ProspectData>(prospect ?? blankProspect);
  const [pending, run] = useRun();
  const set = (k: keyof ProspectData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const pick = (k: keyof ProspectData) => (v: string) => setF({ ...f, [k]: v });
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setF(prospect ?? blankProspect);
      }}
    >
      <DialogTrigger render={trigger} />
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{prospect ? "Edit prospect" : "Add prospect"}</DialogTitle>
          <DialogDescription>Public business details only. The website is how we spot the same company twice.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const { id, ...data } = f;
            void id;
            run(
              async () => {
                if (prospect?.id) return updateProspect(prospect.id, data);
                const res = await createProspect(data);
                if (res.value) router.push(`/prospecting/prospects/${res.value}`);
                return res;
              },
              prospect ? "Prospect updated" : "Prospect added",
              () => setOpen(false),
            );
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="pr-name" label="Company name">
              <Input id="pr-name" autoFocus value={f.name} onChange={set("name")} />
            </Field>
            <Field id="pr-web" label="Website">
              <Input id="pr-web" value={f.website} onChange={set("website")} placeholder="www.example.ae" />
            </Field>
            <Field id="pr-seg" label="Segment">
              <Pick id="pr-seg" value={f.segmentKey} onChange={pick("segmentKey")} options={segments} />
            </Field>
            <Field id="pr-ind" label="Industry">
              <Pick id="pr-ind" value={f.industry} onChange={pick("industry")} options={INDUSTRIES} />
            </Field>
            <Field id="pr-em" label="Emirate">
              <Pick id="pr-em" value={f.emirate} onChange={pick("emirate")} options={EMIRATES} />
            </Field>
            <Field id="pr-size" label="Staff">
              <Pick id="pr-size" value={f.sizeBand} onChange={pick("sizeBand")} options={SIZE_BANDS} />
            </Field>
            <Field id="pr-fz" label="Free zone / authority">
              <Input id="pr-fz" value={f.freeZone} onChange={set("freeZone")} placeholder="Meydan, DMCC, DET..." />
            </Field>
            <Field id="pr-lic" label="Licence no.">
              <Input id="pr-lic" value={f.licenseNo} onChange={set("licenseNo")} />
            </Field>
            <Field id="pr-licd" label="Licence date">
              <Input id="pr-licd" type="date" value={f.licenseDate} onChange={set("licenseDate")} />
            </Field>
            <Field id="pr-phone" label="Main phone">
              <Input id="pr-phone" value={f.phone} onChange={set("phone")} />
            </Field>
            <Field id="pr-mail" label="Company email (info@...)">
              <Input id="pr-mail" type="email" value={f.email} onChange={set("email")} />
            </Field>
            <Field id="pr-li" label="LinkedIn page">
              <Input id="pr-li" value={f.linkedinUrl} onChange={set("linkedinUrl")} placeholder="https://www.linkedin.com/company/..." />
            </Field>
          </div>
          <Field id="pr-act" label="Activity / what they do">
            <Input id="pr-act" value={f.activity} onChange={set("activity")} />
          </Field>
          <Field id="pr-addr" label="Address">
            <Input id="pr-addr" value={f.address} onChange={set("address")} />
          </Field>
          <Field id="pr-src" label="Where we found them (link)">
            <Input id="pr-src" value={f.sourceUrl} onChange={set("sourceUrl")} placeholder="The page that lists them" />
          </Field>
          <Field id="pr-notes" label="Notes">
            <Textarea id="pr-notes" rows={2} value={f.notes} onChange={set("notes")} />
          </Field>
          <Button type="submit" pending={pending} disabled={f.name.trim().length < 2}>
            {prospect ? "Save" : "Add prospect"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Status drop-down for one prospect or a selection. Disqualified asks why and Not now asks when to look again.
 * In sequence, Replied and Converted are set by the app, so they show but cannot be picked.
 */
export function StatusControl({ ids, status, onDone, placeholder }: { ids: number[]; status?: string; onDone?: () => void; placeholder?: string }) {
  const [pending, run] = useRun();
  const [asking, setAsking] = useState<"" | "disqualified" | "not_now">("");
  const [reason, setReason] = useState<string>(DISQUALIFY_REASONS[0]);
  const [until, setUntil] = useState("");
  const apply = (to: string, extra: { reason?: string; snoozeUntil?: string } = {}) =>
    run(() => setProspectStatus(ids, { status: to, ...extra }), ids.length > 1 ? `${ids.length} prospects updated` : "Status updated", () => {
      setAsking("");
      onDone?.();
    });
  return (
    <>
      <NativeSelect
        size="sm"
        aria-label="Status"
        value={status ?? ""}
        disabled={pending || !ids.length}
        onChange={(e) => {
          const to = e.target.value;
          if (!to) return;
          if (to === "disqualified" || to === "not_now") setAsking(to);
          else apply(to);
        }}
      >
        {!status && <NativeSelectOption value="">{placeholder ?? "Set status"}</NativeSelectOption>}
        {STATUSES.map((s) => (
          <NativeSelectOption key={s.key} value={s.key} disabled={!MANUAL_STATUSES.includes(s.key as StatusKey)}>
            {s.label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      <Dialog open={!!asking} onOpenChange={(o) => !o && setAsking("")}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{asking === "disqualified" ? "Disqualify" : "Not now"}</DialogTitle>
            <DialogDescription>{asking === "disqualified" ? "Why is this not a prospect?" : "When should we look at it again?"}</DialogDescription>
          </DialogHeader>
          {asking === "disqualified" ? (
            <NativeSelect className="w-full" aria-label="Reason" value={reason} onChange={(e) => setReason(e.target.value)}>
              {DISQUALIFY_REASONS.map((r) => (
                <NativeSelectOption key={r} value={r}>
                  {r}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          ) : (
            <Input type="date" aria-label="Look again on" min={dubaiToday()} value={until} onChange={(e) => setUntil(e.target.value)} />
          )}
          <Button pending={pending} disabled={asking === "not_now" && !until} onClick={() => apply(asking, asking === "disqualified" ? { reason } : { snoozeUntil: until })}>
            Save
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function OwnerControl({ ids, ownerId, users, onDone }: { ids: number[]; ownerId?: number | null; users: { id: number; name: string }[]; onDone?: () => void }) {
  const [pending, run] = useRun();
  return (
    <NativeSelect
      size="sm"
      aria-label="Owner"
      value={ownerId === undefined ? "-" : String(ownerId ?? "")}
      disabled={pending || !ids.length}
      onChange={(e) => {
        if (e.target.value === "-") return;
        run(() => setProspectOwner(ids, e.target.value ? Number(e.target.value) : null), "Owner updated", onDone);
      }}
    >
      {ownerId === undefined && <NativeSelectOption value="-">Assign to</NativeSelectOption>}
      <NativeSelectOption value="">Nobody</NativeSelectOption>
      {users.map((u) => (
        <NativeSelectOption key={u.id} value={String(u.id)}>
          {u.name}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );
}

export type PersonData = Required<PersonInput> & { id?: number };
const blankPerson: PersonData = { name: "", title: "", roleKind: "decision", email: "", emailStatus: "guess", emailSource: "", phone: "", linkedinUrl: "", isPrimary: false };

/** Add a person at a prospect, or edit one. `roles` are the job titles the segment says to look for. */
export function PersonDialog({ companyId, person, roles = [], trigger }: { companyId: number; person?: PersonData; roles?: string[]; trigger: React.ReactElement }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<PersonData>(person ?? blankPerson);
  const [pending, run] = useRun();
  const set = (k: keyof PersonData) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setF(person ?? blankPerson);
      }}
    >
      <DialogTrigger render={trigger} />
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{person ? "Edit person" : "Add person"}</DialogTitle>
          <DialogDescription>{roles.length ? `For this segment look for: ${roles.join(", ")}.` : "The person who decides, ideally."}</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const { id, ...data } = f;
            void id;
            run(() => (person?.id ? updatePerson(person.id, data) : addPerson(companyId, data)), person ? "Person updated" : "Person added", () => setOpen(false));
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="pp-name" label="Name">
              <Input id="pp-name" autoFocus value={f.name} onChange={set("name")} />
            </Field>
            <Field id="pp-title" label="Job title">
              <Input id="pp-title" value={f.title} onChange={set("title")} list="pp-roles" />
              <datalist id="pp-roles">
                {roles.map((r) => (
                  <option key={r} value={r} />
                ))}
              </datalist>
            </Field>
            <Field id="pp-role" label="Role in buying">
              <Pick id="pp-role" value={f.roleKind} onChange={(v) => setF({ ...f, roleKind: (v || "decision") as PersonData["roleKind"] })} options={ROLE_KINDS} none="Decision maker" />
            </Field>
            <Field id="pp-phone" label="Phone">
              <Input id="pp-phone" value={f.phone} onChange={set("phone")} />
            </Field>
            <Field id="pp-email" label="Email">
              <Input id="pp-email" type="email" value={f.email} onChange={set("email")} />
            </Field>
            <Field id="pp-es" label="How sure is the email?">
              <NativeSelect className="w-full" id="pp-es" value={f.emailStatus} onChange={(e) => setF({ ...f, emailStatus: e.target.value as PersonData["emailStatus"] })}>
                {EMAIL_STATUSES.map((s) => (
                  <NativeSelectOption key={s.key} value={s.key}>
                    {s.label}: {s.hint}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
          </div>
          <Field id="pp-esrc" label="Where the email was seen (link)">
            <Input id="pp-esrc" value={f.emailSource} onChange={set("emailSource")} placeholder="Their website's team page, a press release..." />
          </Field>
          <Field id="pp-li" label="LinkedIn profile (pasted, never scraped)">
            <Input id="pp-li" value={f.linkedinUrl} onChange={set("linkedinUrl")} placeholder="https://www.linkedin.com/in/..." />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={f.isPrimary} onCheckedChange={(v) => setF({ ...f, isPrimary: !!v })} /> Main contact (the one we email first)
          </label>
          <Button type="submit" pending={pending} disabled={!f.name.trim()}>
            {person ? "Save" : "Add person"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeletePersonButton({ id, name }: { id: number; name: string }) {
  const [pending, run] = useRun();
  return (
    <Button variant="ghost" size="icon-sm" aria-label={`Remove ${name}`} title="Remove" pending={pending} onClick={() => confirm(`Remove ${name}?`) && run(() => deletePerson(id), "Person removed")}>
      <Trash2 />
    </Button>
  );
}

/** Record something happening at the company, with the date and the link where it was seen. */
export function SignalDialog({ companyId, trigger }: { companyId: number; trigger: React.ReactElement }) {
  const blank = { kind: "", detail: "", sourceUrl: "", observedOn: dubaiToday() };
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(blank);
  const [pending, run] = useRun();
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setF(blank);
      }}
    >
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a signal</DialogTitle>
          <DialogDescription>Something happening now that makes them likely to buy. It needs a date and a link, so anyone can check it.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-3" onSubmit={(e) => (e.preventDefault(), run(() => addSignal(companyId, f), "Signal added", () => setOpen(false)))}>
          <Field id="sg-kind" label="What is happening">
            <Pick id="sg-kind" value={f.kind} onChange={(v) => setF({ ...f, kind: v })} options={SIGNALS} none="Choose" />
          </Field>
          <Field id="sg-detail" label="Details">
            <Input id="sg-detail" value={f.detail} onChange={(e) => setF({ ...f, detail: e.target.value })} placeholder="Hiring an IT administrator on Bayt" />
          </Field>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <Field id="sg-src" label="Link">
              <Input id="sg-src" value={f.sourceUrl} onChange={(e) => setF({ ...f, sourceUrl: e.target.value })} placeholder="https://..." />
            </Field>
            <Field id="sg-day" label="Date">
              <Input id="sg-day" type="date" max={dubaiToday()} value={f.observedOn} onChange={(e) => setF({ ...f, observedOn: e.target.value })} />
            </Field>
          </div>
          <Button type="submit" pending={pending} disabled={!f.kind || !f.detail.trim() || !f.sourceUrl.trim()}>
            Add signal
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteSignalButton({ id }: { id: number }) {
  const [pending, run] = useRun();
  return (
    <Button variant="ghost" size="icon-sm" aria-label="Remove signal" title="Remove" pending={pending} onClick={() => confirm("Remove this signal?") && run(() => deleteSignal(id), "Signal removed")}>
      <Trash2 />
    </Button>
  );
}

/** The hook for the first email: one sentence that proves we looked at them. */
export function PersonalLineForm({ companyId, value }: { companyId: number; value: string }) {
  const [line, setLine] = useState(value);
  const [pending, run] = useRun();
  const words = line.trim() ? line.trim().split(/\s+/).length : 0;
  return (
    <form className="grid gap-1.5" onSubmit={(e) => (e.preventDefault(), run(() => savePersonalLine(companyId, line), "Personal line saved"))}>
      <Label htmlFor="pl-line">Personal line for the first email</Label>
      <Textarea
        id="pl-line"
        rows={2}
        value={line}
        onChange={(e) => setLine(e.target.value)}
        placeholder="Congratulations on the new Meydan licence; setting up the office is usually when laptops, Wi-Fi and a website all land at once."
      />
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">About them, not about us. Never &ldquo;I came across your company&rdquo;. {words ? `${words} words.` : ""}</span>
        <Button type="submit" size="sm" className="ml-auto" variant="outline" pending={pending} disabled={line === value}>
          Save
        </Button>
      </div>
    </form>
  );
}

export function ProspectNoteForm({ companyId }: { companyId: number }) {
  const [text, setText] = useState("");
  const [pending, run] = useRun();
  return (
    <form className="grid gap-2" onSubmit={(e) => (e.preventDefault(), run(() => addProspectNote(companyId, text), "Note added", () => setText("")))}>
      <Textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="What you found, who you called, what they said…" aria-label="Note" />
      <Button type="submit" size="sm" className="w-fit" pending={pending} disabled={!text.trim()}>
        Add note
      </Button>
    </form>
  );
}

export function DeleteProspectButton({ id, name }: { id: number; name: string }) {
  const router = useRouter();
  const [pending, run] = useRun();
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className="text-destructive"
      aria-label="Delete prospect"
      title="Delete prospect"
      pending={pending}
      onClick={() => confirm(`Delete ${name} with its people and history? This cannot be undone. To keep the record, disqualify it instead.`) && run(() => deleteProspect(id), "Prospect deleted", () => router.replace("/prospecting/prospects"))}
    >
      <Trash2 />
    </Button>
  );
}
