"use client";

import { Loader2, Mail, Paperclip, Send } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { emailQuote } from "../../quote-email-actions";

/**
 * Email icon on the quote page: one window with everything filled in (customer address, subject and message from the
 * admin's template, the quote PDF attached). Send closes the window at once and the email goes out in the background;
 * a message says when it has gone. What was typed is kept, so after a failure it can be fixed and sent again.
 */
export function EmailQuote({
  quoteId,
  number,
  pdfName,
  initial,
}: {
  quoteId: number;
  number: string;
  pdfName: string;
  initial: { to: string; subject: string; body: string };
}) {
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [f, setF] = useState({ ...initial, cc: "", attachPdf: true });
  const set = (k: "to" | "cc" | "subject" | "body") => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const send = async () => {
    setOpen(false);
    setSending(true);
    const id = toast.loading(`Sending ${number} to ${f.to.trim()}…`);
    try {
      const r = await emailQuote(quoteId, f);
      if (r.ok) {
        toast.success(`${number} emailed to ${f.to.trim()}${r.markedSent ? " and marked Sent" : ""}`, {
          id,
          description: r.savedToSent ? undefined : "Sent, but no copy could be saved in your Sent folder.",
        });
        setF({ ...initial, cc: "", attachPdf: true });
      } else {
        toast.error(r.error, { id, duration: 10_000, action: { label: "Fix", onClick: () => setOpen(true) } });
      }
    } catch {
      toast.error("Could not reach the server. Nothing was sent.", { id, action: { label: "Retry", onClick: () => setOpen(true) } });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant="outline"
            size="icon-sm"
            disabled={sending}
            aria-label={sending ? "Sending the quote" : "Email the quote to the customer"}
            title={sending ? "Sending…" : "Email the quote to the customer (PDF attached)"}
          />
        }
      >
        {sending ? <Loader2 className="animate-spin" /> : <Mail />}
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Email {number}</DialogTitle>
          <DialogDescription>Sent from your mailbox with your signature. You can keep working while it goes.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <div className="grid grid-cols-[3rem_1fr] items-center gap-x-2 gap-y-2">
            <Label htmlFor="eq-to">To</Label>
            <Input id="eq-to" value={f.to} onChange={set("to")} placeholder="customer@example.com" autoFocus={!initial.to} />
            <Label htmlFor="eq-cc">Cc</Label>
            <Input id="eq-cc" value={f.cc} onChange={set("cc")} placeholder="optional, separate with commas" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="eq-subject">Subject</Label>
            <Input id="eq-subject" value={f.subject} onChange={set("subject")} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="eq-body">Message</Label>
            <Textarea id="eq-body" rows={11} value={f.body} onChange={set("body")} className="text-sm" />
            <p className="text-xs text-muted-foreground">Your email signature is added below the message.</p>
          </div>
          <label className="flex min-w-0 items-center gap-2 text-sm">
            <Checkbox checked={f.attachPdf} onCheckedChange={(v) => setF({ ...f, attachPdf: !!v })} />
            <Paperclip className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{pdfName}</span>
          </label>
          <DialogFooter>
            <Button type="submit" disabled={!f.to.trim() || !f.subject.trim()}>
              <Send /> Send
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
