"use client";

import { useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Paperclip, Send, X } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { useGoBack } from "@/components/back-button";
import { SignaturePreview } from "@/components/signature-preview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MAX_ATTACHMENT_BYTES, MAX_FILES, MAX_TOTAL_ATTACHMENT_BYTES } from "@/lib/mail/compose";
import type { Brand, Person } from "@/lib/signature";

const sizeLabel = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const TITLES = { new: "New email", reply: "Reply", replyall: "Reply all", forward: "Forward" } as const;

export function ComposeForm({
  mode,
  replyUid,
  dealId,
  initial,
  loadError,
  brand,
  version,
  person,
}: {
  mode: keyof typeof TITLES;
  replyUid: number;
  /** The deal this email belongs to (opened from Sales); the sent email is logged on its timeline. */
  dealId: number;
  initial: { to: string; cc: string; subject: string; quote: string };
  loadError: string;
  brand: Brand;
  version: number;
  person: Person;
}) {
  // after sending or discarding, return to where the email was started (a deal, a quote, the inbox)
  const goBack = useGoBack("/mail");
  const qc = useQueryClient();
  const [f, setF] = useState({ to: initial.to, cc: initial.cc, bcc: "", subject: initial.subject, body: "" });
  const [showCc, setShowCc] = useState(!!initial.cc);
  const [showBcc, setShowBcc] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [withQuote, setWithQuote] = useState(true);
  const [sending, setSending] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const total = files.reduce((n, x) => n + x.size, 0);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const next = [...files];
    for (const file of Array.from(list)) {
      if (file.size > MAX_ATTACHMENT_BYTES) return void toast.error(`${file.name} is over 10 MB.`);
      next.push(file);
    }
    if (next.length > MAX_FILES) return void toast.error(`Attach at most ${MAX_FILES} files.`);
    if (next.reduce((n, x) => n + x.size, 0) > MAX_TOTAL_ATTACHMENT_BYTES) return void toast.error("The attachments add up to over 15 MB.");
    setFiles(next);
  };

  const send = async () => {
    setSending(true);
    try {
      const fd = new FormData();
      for (const k of ["to", "cc", "bcc", "subject", "body"] as const) fd.set(k, f[k]);
      fd.set("quote", withQuote ? initial.quote : "");
      fd.set("mode", mode);
      fd.set("replyUid", String(replyUid));
      if (dealId) fd.set("dealId", String(dealId));
      for (const file of files) fd.append("files", file);
      const res = await fetch("/api/mail/send", { method: "POST", body: fd });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.error ?? "Could not send the email.");
      if (out.savedToSent === false) toast.warning("Sent, but a copy could not be saved to your Sent folder.");
      else toast.success("Email sent");
      qc.invalidateQueries({ queryKey: ["mail-list"] });
      goBack();
    } catch (e) {
      toast.error((e as Error).message);
      setSending(false);
    }
  };

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const canSend = !sending && f.to.trim() && (f.body.trim() || files.length);

  return (
    <form
      className="grid gap-4 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSend) void send();
      }}
    >
      <div>
        <Link href="/mail" className="mb-2 inline-flex items-center gap-0.5 text-sm text-muted-foreground hover:text-foreground md:hidden">
          <ChevronLeft className="size-4" /> Inbox
        </Link>
        <h1 className="text-base font-semibold">{TITLES[mode]}</h1>
        {loadError && <p className="mt-1 text-sm text-destructive">{loadError}</p>}
      </div>

      <div className="grid gap-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="mail-to">To</Label>
          <div className="flex gap-3 text-xs text-muted-foreground">
            {!showCc && (
              <button type="button" className="hover:text-foreground hover:underline" onClick={() => setShowCc(true)}>
                Cc
              </button>
            )}
            {!showBcc && (
              <button type="button" className="hover:text-foreground hover:underline" onClick={() => setShowBcc(true)}>
                Bcc
              </button>
            )}
          </div>
        </div>
        <Input id="mail-to" autoFocus={!f.to} value={f.to} onChange={set("to")} placeholder="name@company.com, another@company.com" />
      </div>
      {showCc && (
        <div className="grid gap-1.5">
          <Label htmlFor="mail-cc">Cc</Label>
          <Input id="mail-cc" value={f.cc} onChange={set("cc")} />
        </div>
      )}
      {showBcc && (
        <div className="grid gap-1.5">
          <Label htmlFor="mail-bcc">Bcc (hidden from the others)</Label>
          <Input id="mail-bcc" value={f.bcc} onChange={set("bcc")} />
        </div>
      )}
      <div className="grid gap-1.5">
        <Label htmlFor="mail-subject">Subject</Label>
        <Input id="mail-subject" value={f.subject} onChange={set("subject")} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="mail-body">Message</Label>
        <Textarea id="mail-body" autoFocus={!!f.to} rows={10} value={f.body} onChange={set("body")} className="min-h-48" />
      </div>

      <div className="grid gap-2">
        <input ref={picker} type="file" multiple className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => picker.current?.click()}>
            <Paperclip /> Attach files
          </Button>
          {files.length > 0 && <span className="text-xs text-muted-foreground">{files.length} file(s), {sizeLabel(total)} of 15 MB</span>}
        </div>
        {files.map((file, i) => (
          <div key={`${file.name}-${i}`} className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm">
            <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">{file.name}</span>
            <span className="text-xs text-muted-foreground">{sizeLabel(file.size)}</span>
            <button type="button" aria-label={`Remove ${file.name}`} onClick={() => setFiles(files.filter((_, j) => j !== i))}>
              <X className="size-4 text-muted-foreground hover:text-foreground" />
            </button>
          </div>
        ))}
      </div>

      <div className="grid gap-1.5">
        <Label>Your signature (added automatically)</Label>
        <SignaturePreview brand={brand} person={person} logoSrc={`/api/brand/logo?v=${version}`} />
      </div>

      {initial.quote.trim() && (
        <div className="grid gap-1.5">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={withQuote} onChange={(e) => setWithQuote(e.target.checked)} />
            {mode === "forward" ? "Include the forwarded message" : "Include the original message below"}
          </label>
          {withQuote && (
            <pre className="max-h-48 overflow-auto rounded-md border bg-muted/40 p-3 text-xs whitespace-pre-wrap">{initial.quote.trim()}</pre>
          )}
          {mode === "forward" && <p className="text-xs text-muted-foreground">Attachments of the original are not forwarded. Download and attach them if needed.</p>}
        </div>
      )}

      <div className="flex gap-2">
        <Button type="submit" pending={sending} disabled={!canSend}>
          <Send /> {sending ? "Sending…" : "Send"}
        </Button>
        <Button type="button" variant="ghost" pending={sending} onClick={goBack}>
          Discard
        </Button>
      </div>
    </form>
  );
}
