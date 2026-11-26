"use client";

import { Copy, Pause, Play, Timer, Trash2 } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deleteNewsletter, duplicateNewsletter, pauseNewsletter, setCooloffDays } from "./actions";
import { useRun } from "./audience-ui";

export function PauseButton({ id, paused }: { id: number; paused: boolean }) {
  const [pending, run] = useRun();
  return (
    <Button variant="outline" size="sm" pending={pending} onClick={() => run(() => pauseNewsletter(id, !paused), paused ? "Sending resumed" : "Sending paused")}>
      {paused ? <Play /> : <Pause />} {paused ? "Resume" : "Pause"}
    </Button>
  );
}

/** Makes a new draft from this newsletter, to reuse a design. */
export function DuplicateButton({ id }: { id: number }) {
  const router = useRouter();
  const [pending, run] = useRun<number>();
  return (
    <Button variant="outline" size="sm" pending={pending} onClick={() => run(() => duplicateNewsletter(id), "Copied to a new draft", (newId) => router.push(`/newsletter/campaigns/${newId}`))}>
      <Copy /> Duplicate
    </Button>
  );
}

export function DeleteNewsletterButton({ id, name }: { id: number; name: string }) {
  const router = useRouter();
  const [pending, run] = useRun();
  return (
    <Button
      variant="outline"
      size="icon-sm"
      aria-label="Delete newsletter"
      title="Delete newsletter"
      pending={pending}
      onClick={() => confirm(`Delete "${name}"? Its sending record is deleted too.`) && run(() => deleteNewsletter(id), "Deleted", () => router.replace("/newsletter"))}
    >
      <Trash2 />
    </Button>
  );
}

export function CooloffButton({ days }: { days: number }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(String(days));
  const [pending, run] = useRun();
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setValue(String(days));
      }}
    >
      <DialogTrigger
        render={
          <Button variant="outline" size="icon-sm" aria-label="Cool-off between newsletters" title={`Cool-off: ${days} day${days === 1 ? "" : "s"}`}>
            <Timer />
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cool-off between newsletters</DialogTitle>
          <DialogDescription>Nobody gets two newsletters within this many days, even from different lists. Anyone mailed more recently is skipped, and the campaign page shows who and why. Sending hours and daily limits per mailbox are set in Prospecting › Settings.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => setCooloffDays(Number(value)), "Cool-off saved", () => setOpen(false));
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="nl-cool">Days (0 = no cool-off)</Label>
            <Input id="nl-cool" type="number" min={0} max={365} inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value)} />
          </div>
          <Button type="submit" pending={pending} disabled={value.trim() === ""}>
            Save
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
