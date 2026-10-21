"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { stageLabel } from "@/lib/sales";
import { EnquiryForm } from "./enquiry-form";

/** The "+" on a board column: the enquiry form in a dialog, starting at that column's stage. */
export function EnquiryDialog({ users, meId, stage }: { users: { id: number; name: string }[]; meId: number; stage: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Add a deal to ${stageLabel(stage)}`} title={`Add a deal to ${stageLabel(stage)}`} />}>
        <Plus />
      </DialogTrigger>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>New enquiry</DialogTitle>
          <DialogDescription>Added to {stageLabel(stage)}.</DialogDescription>
        </DialogHeader>
        {open && <EnquiryForm users={users} meId={meId} preset={null} stage={stage} onCreated={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  );
}
