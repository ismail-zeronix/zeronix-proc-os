"use client";

import { ArrowRightLeft, Building2, CircleAlert, Trophy } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { markDealWon, moveDeal, wonCheck } from "@/app/(app)/crm/actions";
import { Textarea } from "@/components/ui/textarea";
import { money, quoteStatusLabel } from "@/lib/quotation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { LOST_REASONS, STAGES } from "@/lib/sales";

/**
 * Change a deal's stage. `variant="select"` is a drop-down showing the stage (lists, deal page);
 * `variant="icon"` is a small button with a menu (cards, where space is tight). Choosing "Lost" first asks why;
 * choosing "Won" opens Mark as won (the customer, the winning quote, missing details).
 */
export function StageMenu({
  dealId,
  stage,
  size = "sm",
  label,
  variant = "select",
}: {
  dealId: number;
  stage: string;
  size?: "sm" | "default";
  label?: string;
  variant?: "select" | "icon";
}) {
  const [pending, start] = useTransition();
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState<string>(LOST_REASONS[0]);
  const [other, setOther] = useState("");

  const move = (to: string, why = "") =>
    start(async () => {
      try {
        await moveDeal(dealId, to, why);
        toast.success(to === "won" ? "Marked as won" : to === "lost" ? "Marked as lost" : "Stage updated");
        setAsking(false);
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  const [winning, setWinning] = useState(false);
  const choose = (to: string) => (to === "lost" ? setAsking(true) : to === "won" ? setWinning(true) : move(to));

  return (
    <>
      {variant === "select" ? (
        <NativeSelect size={size} aria-label={label ?? "Move to stage"} value={stage} disabled={pending} onChange={(e) => choose(e.target.value)}>
          {STAGES.map((s) => (
            <NativeSelectOption key={s.key} value={s.key}>
              {s.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Move to another stage" title="Move to another stage" pending={pending} />}>
            <ArrowRightLeft />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Move to</DropdownMenuLabel>
              {STAGES.filter((s) => s.key !== stage).map((s) => (
                <DropdownMenuItem key={s.key} onClick={() => choose(s.key)}>
                  {s.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {winning && <WonDialog dealId={dealId} onClose={() => setWinning(false)} />}
      <Dialog open={asking} onOpenChange={setAsking}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Why was this deal lost?</DialogTitle>
            <DialogDescription>Knowing why helps us win the next one.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor={`lost-reason-${dealId}`}>Reason</Label>
              <NativeSelect id={`lost-reason-${dealId}`} value={reason} onChange={(e) => setReason(e.target.value)}>
                {LOST_REASONS.map((r) => (
                  <NativeSelectOption key={r} value={r}>
                    {r}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            {reason === "Other" && (
              <div className="grid gap-1.5">
                <Label htmlFor={`lost-other-${dealId}`}>Tell us more</Label>
                <Input id={`lost-other-${dealId}`} value={other} onChange={(e) => setOther(e.target.value)} />
              </div>
            )}
            <div className="flex gap-2">
              <Button pending={pending} disabled={(reason === "Other" && !other.trim())} onClick={() => move("lost", reason === "Other" ? `Other: ${other.trim()}` : reason)}>
                Mark as lost
              </Button>
              <Button variant="ghost" onClick={() => setAsking(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

type Check = Awaited<ReturnType<typeof wonCheck>>;

/**
 * Mark as won: shows the company the deal becomes a customer under (the existing record, nothing new is made), asks for
 * the winning quote or what was agreed, and lists customer details still missing. Missing details never block the win:
 * the owner gets a follow-up task, and the invoice waits for the details it needs.
 */
function WonDialog({ dealId, onClose }: { dealId: number; onClose: () => void }) {
  const [check, setCheck] = useState<Check | null>(null);
  const [quoteId, setQuoteId] = useState<string>("");
  const [terms, setTerms] = useState("");
  const [pending, start] = useTransition();
  // load once per deal (onClose is a new function on every render of the menu)
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  useEffect(() => {
    wonCheck(dealId)
      .then((c) => {
        setCheck(c);
        const pick = c.quotes.find((q) => q.status === "accepted") ?? c.quotes.find((q) => q.status === "sent") ?? c.quotes[0];
        setQuoteId(pick ? String(pick.id) : "");
      })
      .catch((e) => {
        toast.error((e as Error).message);
        close.current();
      });
  }, [dealId]);
  const can = !!check && (quoteId ? true : terms.trim().length >= 3);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trophy className="size-4 text-emerald-600" /> Mark as won
          </DialogTitle>
          <DialogDescription>The company becomes a customer in Sales. Nothing is copied.</DialogDescription>
        </DialogHeader>
        {!check ? (
          <p className="text-sm text-muted-foreground">Checking the customer…</p>
        ) : (
          <div className="grid gap-3">
            <div className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
              <Building2 className="size-4 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate font-medium">{check.company.name}</span>
              {check.contactName && <span className="truncate text-xs text-muted-foreground">{check.contactName}</span>}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`won-quote-${dealId}`}>Winning quote</Label>
              <NativeSelect id={`won-quote-${dealId}`} value={quoteId} onChange={(e) => setQuoteId(e.target.value)}>
                {check.quotes.map((q) => (
                  <NativeSelectOption key={q.id} value={String(q.id)}>
                    {q.number} · {quoteStatusLabel(q.status)} · {money(q.total)}
                  </NativeSelectOption>
                ))}
                <NativeSelectOption value="">No quote in the portal: write what was agreed</NativeSelectOption>
              </NativeSelect>
            </div>
            {!quoteId && (
              <div className="grid gap-1.5">
                <Label htmlFor={`won-terms-${dealId}`}>What was agreed</Label>
                <Textarea id={`won-terms-${dealId}`} rows={2} value={terms} onChange={(e) => setTerms(e.target.value)} maxLength={500} placeholder="Amount, their PO number, payment terms" />
              </div>
            )}
            {check.gaps.length > 0 ? (
              <div className="grid gap-1 rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs">
                <span className="flex items-center gap-1.5 font-medium">
                  <CircleAlert className="size-3.5 text-amber-600" /> Customer details missing (the deal can still be won)
                </span>
                <ul className="ml-5 list-disc">
                  {check.gaps.map((g) => (
                    <li key={g.key}>
                      {g.label}
                      {g.blocksInvoice ? " · needed before the invoice" : ""}
                    </li>
                  ))}
                </ul>
                <span className="text-muted-foreground">The deal owner gets a follow-up task to complete them.</span>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Customer details are complete.</p>
            )}
            <div className="flex gap-2">
              <Button
                pending={pending}
                disabled={!can}
                onClick={() =>
                  start(async () => {
                    try {
                      const r = await markDealWon(dealId, { quoteId: quoteId ? Number(quoteId) : null, terms });
                      toast.success(r.gaps.length ? "Won. A task to complete the customer details was added." : "Marked as won");
                      onClose();
                    } catch (e) {
                      toast.error((e as Error).message);
                    }
                  })
                }
              >
                <Trophy /> Mark as won
              </Button>
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
