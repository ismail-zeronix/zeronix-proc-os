"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { stageLabel } from "@/lib/sales";
import { DealForm } from "./deal-form";

/**
 * The new-deal form in a dialog, starting at a stage: the "+" on a board column, or a "New deal" button (`label`).
 * `quoteNext` opens the quote builder in Accounts on the new deal.
 */
export function DealDialog({
  users,
  meId,
  stage,
  projectTypes,
  kind,
  label,
  quoteNext = false,
}: {
  users: { id: number; name: string }[];
  meId: number;
  stage: string;
  projectTypes?: { key: string; label: string }[];
  kind?: "product" | "project";
  label?: string;
  quoteNext?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const title = `Add a deal to ${stageLabel(stage)}`;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={label ? <Button variant="outline" size="sm" title={title} /> : <Button variant="ghost" size="icon-sm" aria-label={title} title={title} />}
      >
        <Plus />
        {label}
      </DialogTrigger>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{kind === "project" ? "New project deal" : "New deal"}</DialogTitle>
          <DialogDescription>Added to {stageLabel(stage)}.</DialogDescription>
        </DialogHeader>
        {open && (
          <DealForm
            users={users}
            meId={meId}
            preset={null}
            stage={stage}
            projectTypes={projectTypes}
            kind={kind}
            onCreated={() => setOpen(false)}
            afterHref={quoteNext ? (id) => `/sales/quotes/new?deal=${id}` : undefined}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
