"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { QUOTE_STATUSES } from "@/lib/quotation";
import { deleteQuote, setQuoteStatus, updateQuote } from "../../quote-actions";

function useRun() {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<unknown>, ok?: string, after?: () => void) =>
    start(async () => {
      try {
        await fn();
        if (ok) toast.success(ok);
        after?.();
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  return [pending, run] as const;
}

/** Where the quote is in its life. Choosing Sent or Accepted also moves the deal (the page says so before it happens). */
export function StatusSelect({ quoteId, status, dealStage }: { quoteId: number; status: string; dealStage: string }) {
  const [pending, run] = useRun();
  const choose = (to: string) => {
    if (to === "accepted" && dealStage !== "won" && !confirm("The customer accepted this quote. This marks the deal as Won at the quoted amount. Continue?")) return;
    run(async () => {
      const r = await setQuoteStatus(quoteId, to);
      if (r.stage === "won") toast.success("Deal marked as won");
      else if (r.stage === "quoted") toast.success("Deal moved to Quote sent");
      else toast.success("Status updated");
    });
  };
  return (
    <NativeSelect size="sm" aria-label="Quote status" value={status === "expired" ? "sent" : status} disabled={pending} onChange={(e) => choose(e.target.value)}>
      {QUOTE_STATUSES.filter((s) => s.key !== "expired").map((s) => (
        <NativeSelectOption key={s.key} value={s.key}>
          {s.label}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );
}

/** Valid-until date and terms of this quote only. */
export function QuoteEdit({ quoteId, validUntil, terms, locked }: { quoteId: number; validUntil: string; terms: string; locked: boolean }) {
  const [until, setUntil] = useState(validUntil);
  const [text, setText] = useState(terms);
  const [pending, run] = useRun();
  return (
    <div className="grid gap-2">
      <div className="grid gap-1">
        <Label htmlFor="q-until" className="text-xs">
          Valid until
        </Label>
        <Input id="q-until" type="date" className="h-8 w-44" value={until} disabled={locked} onChange={(e) => setUntil(e.target.value)} />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="q-terms" className="text-xs">
          Terms (one per line)
        </Label>
        <Textarea id="q-terms" rows={5} value={text} disabled={locked} onChange={(e) => setText(e.target.value)} />
      </div>
      {locked ? (
        <p className="text-xs text-muted-foreground">The customer has answered, so this quote is locked.</p>
      ) : (
        <Button className="w-fit" size="sm" pending={pending} disabled={(until === validUntil && text === terms) || !until} onClick={() => run(() => updateQuote(quoteId, { validUntil: until, terms: text }), "Saved")}>
          Save
        </Button>
      )}
    </div>
  );
}

export function DeleteQuote({ quoteId, number }: { quoteId: number; number: string }) {
  const router = useRouter();
  const [pending, run] = useRun();
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className="text-muted-foreground hover:text-destructive"
      aria-label="Delete this quote"
      title="Delete this quote"
      pending={pending}
      onClick={() => confirm(`Delete quote ${number}? This cannot be undone.`) && run(() => deleteQuote(quoteId), "Quote deleted", () => router.replace("/accounts/quotes"))}
    >
      <Trash2 />
    </Button>
  );
}
