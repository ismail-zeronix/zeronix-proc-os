"use client";

import { Trash2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { errorText } from "@/lib/user-error";
import { createList, deleteList, importContacts, removeContact, updateList } from "./actions";

/** Runs an action: shows its returned `{ error }` (or a thrown one), otherwise the success message. */
export function useRun<T = undefined>() {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ error?: string; value?: T }>, ok: string | ((v: T) => string), after?: (v: T) => void) =>
    start(async () => {
      try {
        const res = await fn();
        if (res.error) return void toast.error(res.error);
        const msg = typeof ok === "function" ? ok(res.value as T) : ok;
        if (msg) toast.success(msg);
        after?.(res.value as T);
      } catch (e) {
        toast.error(errorText(e));
      }
    });
  return [pending, run] as const;
}

export function ListDialog({ list, trigger }: { list?: { id: number; name: string; consentNote: string }; trigger: React.ReactElement }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(list?.name ?? "");
  const [note, setNote] = useState(list?.consentNote ?? "");
  const [pending, run] = useRun<number | undefined>();
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setName(list?.name ?? "");
          setNote(list?.consentNote ?? "");
        }
      }}
    >
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{list ? "Edit list" : "New list"}</DialogTitle>
          <DialogDescription>A list is a group of people you send the same newsletters to, for example &ldquo;Dubai offices&rdquo; or &ldquo;Existing customers&rdquo;.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (list) run(() => updateList(list.id, { name, consentNote: note }), "List saved", () => setOpen(false));
            else
              run(
                () => createList({ name, consentNote: note }),
                "List created",
                (id) => {
                  setOpen(false);
                  if (id) router.push(`/newsletter/audiences/${id}`);
                },
              );
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="nl-name">Name</Label>
            <Input id="nl-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="nl-note">Why they get our email</Label>
            <Textarea id="nl-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="You are receiving this because you are a customer of Zeronix." />
            <p className="text-xs text-muted-foreground">Printed in the footer of every newsletter to this list, next to the unsubscribe link. Leave empty for the standard sentence.</p>
          </div>
          <Button type="submit" pending={pending} disabled={name.trim().length < 2}>
            {list ? "Save" : "Create list"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function AddEmailsDialog({ listId, trigger }: { listId: number; trigger: React.ReactElement }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [source, setSource] = useState("");
  const [pending, run] = useRun<{ added: number; duplicates: number; blocked: number; invalid: string[] }>();
  const file = useRef<HTMLInputElement>(null);
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setText("");
          setSource("");
        }
      }}
    >
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Add emails</DialogTitle>
          <DialogDescription>Only add people who have agreed to hear from you or who have a business relationship with you. Do not add bought or scraped lists.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(
              () => importContacts(listId, text, source),
              (r) => `${r.added} added${r.duplicates ? ` · ${r.duplicates} already there` : ""}${r.blocked ? ` · ${r.blocked} on the do-not-contact list` : ""}${r.invalid.length ? ` · ${r.invalid.length} lines skipped` : ""}`,
              () => setOpen(false),
            );
          }}
        >
          <div className="grid gap-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="nl-emails">Paste emails</Label>
              <Button type="button" variant="ghost" size="sm" onClick={() => file.current?.click()}>
                <Upload /> From a file
              </Button>
              <input
                ref={file}
                type="file"
                accept=".csv,.txt,.tsv,text/csv,text/plain"
                hidden
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) setText(await f.text());
                  e.target.value = "";
                }}
              />
            </div>
            <Textarea id="nl-emails" rows={9} value={text} onChange={(e) => setText(e.target.value)} placeholder={"sara@acme.ae\nOmar Ali <omar@beta.ae>\ninfo@gamma.ae, Layla Hassan, Gamma Trading"} className="font-mono text-xs" />
            <p className="text-xs text-muted-foreground">One per line. A line can also hold a name and a company, or paste a CSV with the columns email, name, company.</p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="nl-source">Where do these addresses come from?</Label>
            <Input id="nl-source" value={source} onChange={(e) => setSource(e.target.value)} placeholder="Existing customers, met at GITEX 2026, signed up on the website..." maxLength={200} />
          </div>
          <Button type="submit" pending={pending} disabled={!text.trim() || source.trim().length < 3}>
            Add to list
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RemoveContactButton({ id, email }: { id: number; email: string }) {
  const [pending, run] = useRun();
  return (
    <Button variant="ghost" size="icon-sm" aria-label={`Remove ${email}`} title="Remove from list" pending={pending} onClick={() => confirm(`Remove ${email} from this list?`) && run(() => removeContact(id), "Removed")}>
      <Trash2 />
    </Button>
  );
}

export function DeleteListButton({ id, name }: { id: number; name: string }) {
  const router = useRouter();
  const [pending, run] = useRun();
  return (
    <Button
      variant="outline"
      size="icon-sm"
      aria-label="Delete list"
      title="Delete list"
      pending={pending}
      onClick={() => confirm(`Delete the list "${name}" and everyone in it? Newsletters already sent are not affected.`) && run(() => deleteList(id), "List deleted", () => router.replace("/newsletter/audiences"))}
    >
      <Trash2 />
    </Button>
  );
}
