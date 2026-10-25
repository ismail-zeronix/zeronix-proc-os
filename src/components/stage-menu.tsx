"use client";

import { ArrowRightLeft } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { moveDeal } from "@/app/(app)/crm/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { LOST_REASONS, STAGES } from "@/lib/sales";

/**
 * Change a deal's stage. `variant="select"` is a drop-down showing the stage (lists, deal page);
 * `variant="icon"` is a small button with a menu (cards, where space is tight). Choosing "Lost" first asks why.
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
  const choose = (to: string) => (to === "lost" ? setAsking(true) : move(to));

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
