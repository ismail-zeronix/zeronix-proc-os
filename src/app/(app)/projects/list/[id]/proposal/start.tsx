"use client";

import { FileText, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { startProposal } from "../../../proposal-actions";

/** A project without a proposal: pick what it starts from. */
export function StartProposal({ projectId, typeLabel, templates }: { projectId: number; typeLabel: string; templates: { id: number; name: string; forType: boolean; blocks: number }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [picked, setPicked] = useState<number | null | undefined>(undefined);
  const go = (templateId: number | null) => {
    setPicked(templateId);
    start(async () => {
      try {
        await startProposal(projectId, templateId);
        router.refresh();
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  };
  const card = (key: string, id: number | null, title: string, hint: string) => (
    <button
      key={key}
      type="button"
      disabled={pending}
      onClick={() => go(id)}
      className="flex items-start gap-3 rounded-xl border bg-card p-4 text-left transition-colors hover:border-primary/50 hover:bg-muted/40 disabled:opacity-60"
    >
      {pending && picked === id ? <Loader2 className="mt-0.5 size-5 animate-spin text-primary" /> : <FileText className="mt-0.5 size-5 text-primary" />}
      <span>
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
    </button>
  );
  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground">
        A proposal is the document the customer receives: cover, your understanding of the job, scope, the price from the BOQ, payment schedule, timeline and terms. Pick a starting point; everything can be changed.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {card("standard", null, "Standard proposal", `Cover, about Zeronix, the requirement, scope, price, payment, timeline, warranty, exclusions, terms and signatures, set up for ${typeLabel}.`)}
        {templates.map((t) => card(`t${t.id}`, t.id, t.name, `${t.blocks} blocks · ${t.forType ? `${typeLabel} template` : "for every project type"}`))}
      </div>
    </div>
  );
}
