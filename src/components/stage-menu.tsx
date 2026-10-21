"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { moveDeal } from "@/app/(app)/sales/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { LOST_REASONS, STAGES } from "@/lib/sales";

/** Change a deal's stage from a menu. Choosing "Lost" first asks why. */
export function StageMenu({ dealId, stage, size = "sm", label }: { dealId: number; stage: string; size?: "sm" | "default"; label?: string }) {
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

  return (
    <>
      <NativeSelect
        size={size}
        aria-label={label ?? "Move to stage"}
        value={stage}
        disabled={pending}
        onChange={(e) => (e.target.value === "lost" ? setAsking(true) : move(e.target.value))}
      >
        {STAGES.map((s) => (
          <NativeSelectOption key={s.key} value={s.key}>
            {s.label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      <Dialog open={asking} onOpenChange={setAsking}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Why was this deal lost?</DialogTitle>
            <DialogDescription>Knowing why helps us win the next one.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="lost-reason">Reason</Label>
              <NativeSelect id="lost-reason" value={reason} onChange={(e) => setReason(e.target.value)}>
                {LOST_REASONS.map((r) => (
                  <NativeSelectOption key={r} value={r}>
                    {r}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            {reason === "Other" && (
              <div className="grid gap-1.5">
                <Label htmlFor="lost-other">Tell us more</Label>
                <Input id="lost-other" value={other} onChange={(e) => setOther(e.target.value)} />
              </div>
            )}
            <div className="flex gap-2">
              <Button disabled={pending || (reason === "Other" && !other.trim())} onClick={() => move("lost", reason === "Other" ? `Other: ${other.trim()}` : reason)}>
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
