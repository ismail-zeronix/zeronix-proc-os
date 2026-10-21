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
import { EMIRATES, INDUSTRIES, SOURCES } from "@/lib/sales";
import { addCompanyNote, createCompany, createContact, deleteCompany, deleteContact, updateCompany, updateContact } from "../actions";

function useRun() {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<unknown>, ok: string, after?: () => void) =>
    start(async () => {
      try {
        await fn();
        toast.success(ok);
        after?.();
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  return [pending, run] as const;
}

export interface CompanyData {
  id?: number;
  name: string;
  industry: string;
  emirate: string;
  website: string;
  phone: string;
  tradeLicenseNo: string;
  trn: string;
  source: string;
  notes: string;
}

const blankCompany: CompanyData = { name: "", industry: "", emirate: "", website: "", phone: "", tradeLicenseNo: "", trn: "", source: "", notes: "" };

function Select({ id, label, value, onChange, options }: { id: string; label: string; value: string; onChange: (v: string) => void; options: readonly string[] }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <NativeSelect className="w-full" id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        <NativeSelectOption value="">Not sure</NativeSelectOption>
        {options.map((o) => (
          <NativeSelectOption key={o} value={o}>
            {o}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </div>
  );
}

/** Add a company, or edit one when `company` is given. */
export function CompanyDialog({ company, trigger }: { company?: CompanyData; trigger: React.ReactElement }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<CompanyData>(company ?? blankCompany);
  const [pending, run] = useRun();
  const set = (k: keyof CompanyData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setF(company ?? blankCompany);
      }}
    >
      <DialogTrigger render={trigger} />
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{company ? "Edit company" : "Add company"}</DialogTitle>
          <DialogDescription>{company ? "Change the details." : "The same company cannot be added twice."}</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const { id, ...data } = f;
            run(
              async () => {
                if (company?.id) await updateCompany(company.id, data);
                else {
                  const newId = await createCompany(data);
                  router.push(`/sales/companies/${newId}`);
                }
              },
              company ? "Company updated" : "Company added",
              () => setOpen(false),
            );
            void id;
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="co-name">Company name</Label>
            <Input id="co-name" autoFocus value={f.name} onChange={set("name")} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Select id="co-ind" label="Industry" value={f.industry} onChange={(v) => setF({ ...f, industry: v })} options={INDUSTRIES} />
            <Select id="co-em" label="Emirate" value={f.emirate} onChange={(v) => setF({ ...f, emirate: v })} options={EMIRATES} />
            <div className="grid gap-1.5">
              <Label htmlFor="co-web">Website</Label>
              <Input id="co-web" value={f.website} onChange={set("website")} placeholder="www.example.ae" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="co-phone">Main phone</Label>
              <Input id="co-phone" value={f.phone} onChange={set("phone")} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="co-lic">Trade licence no.</Label>
              <Input id="co-lic" value={f.tradeLicenseNo} onChange={set("tradeLicenseNo")} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="co-trn">TRN</Label>
              <Input id="co-trn" value={f.trn} onChange={set("trn")} />
            </div>
          </div>
          <Select id="co-src" label="Where did we find them?" value={f.source} onChange={(v) => setF({ ...f, source: v })} options={SOURCES} />
          <div className="grid gap-1.5">
            <Label htmlFor="co-notes">Notes</Label>
            <Textarea id="co-notes" value={f.notes} onChange={set("notes")} />
          </div>
          <Button type="submit" disabled={pending || f.name.trim().length < 2}>
            {company ? "Save" : "Add company"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export interface ContactData {
  id?: number;
  name: string;
  jobTitle: string;
  email: string;
  phone: string;
  whatsapp: string;
  isDecisionMaker: boolean;
}

const blankContact: ContactData = { name: "", jobTitle: "", email: "", phone: "", whatsapp: "", isDecisionMaker: false };

/** Add a person to a company, or edit one when `contact` is given. */
export function ContactDialog({ companyId, contact, trigger }: { companyId: number; contact?: ContactData; trigger: React.ReactElement }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<ContactData>(contact ?? blankContact);
  const [pending, run] = useRun();
  const set = (k: keyof ContactData) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setF(contact ?? blankContact);
      }}
    >
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{contact ? "Edit person" : "Add person"}</DialogTitle>
          <DialogDescription>Someone at this company we talk to.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const { id, ...data } = f;
            void id;
            run(() => (contact?.id ? updateContact(contact.id, data) : createContact(companyId, data)), contact ? "Person updated" : "Person added", () => setOpen(false));
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="ct-name">Name</Label>
            <Input id="ct-name" autoFocus value={f.name} onChange={set("name")} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="ct-job">Job title</Label>
              <Input id="ct-job" value={f.jobTitle} onChange={set("jobTitle")} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ct-email">Email</Label>
              <Input id="ct-email" type="email" value={f.email} onChange={set("email")} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ct-phone">Phone</Label>
              <Input id="ct-phone" value={f.phone} onChange={set("phone")} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ct-wa">WhatsApp (if different)</Label>
              <Input id="ct-wa" value={f.whatsapp} onChange={set("whatsapp")} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={f.isDecisionMaker} onCheckedChange={(v) => setF({ ...f, isDecisionMaker: !!v })} /> Decision maker
          </label>
          <Button type="submit" disabled={pending || !f.name.trim()}>
            {contact ? "Save" : "Add person"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteContactButton({ id, name }: { id: number; name: string }) {
  const [pending, run] = useRun();
  return (
    <Button variant="ghost" size="icon-sm" aria-label={`Delete ${name}`} disabled={pending} onClick={() => confirm(`Remove ${name}?`) && run(() => deleteContact(id), "Person removed")}>
      <Trash2 />
    </Button>
  );
}

export function DeleteCompanyButton({ id, name, deals }: { id: number; name: string; deals: number }) {
  const router = useRouter();
  const [pending, run] = useRun();
  return (
    <Button
      variant="ghost"
      size="sm"
      className="text-destructive"
      disabled={pending}
      onClick={() =>
        confirm(`Delete ${name}${deals ? ` and its ${deals} deal(s)` : ""}, with all people and history? This cannot be undone.`) &&
        run(() => deleteCompany(id), "Company deleted", () => router.push("/sales/companies"))
      }
    >
      <Trash2 /> Delete company
    </Button>
  );
}

export function CompanyNoteForm({ companyId }: { companyId: number }) {
  const [text, setText] = useState("");
  const [pending, run] = useRun();
  return (
    <form
      className="grid gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => addCompanyNote(companyId, text), "Note added", () => setText(""));
      }}
    >
      <Textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a note about this company…" aria-label="Note" />
      <Button type="submit" size="sm" className="w-fit" disabled={pending || !text.trim()}>
        Add note
      </Button>
    </form>
  );
}
