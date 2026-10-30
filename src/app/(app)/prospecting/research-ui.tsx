"use client";

import { Check, ScanSearch } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { researchState, startResearch, applyFinding } from "./actions";
import { useRun } from "./prospect-ui";

/** Starts website research for one prospect or a selection. */
export function ResearchButton({ ids, running = false, size = "sm", onDone }: { ids: number[]; running?: boolean; size?: "sm" | "default"; onDone?: () => void }) {
  const router = useRouter();
  const [pending, run] = useRun();
  return (
    <Button
      variant="outline"
      size={size}
      pending={pending || running}
      disabled={!ids.length}
      title="Read their website for emails, phones and people. AI is used only if the website shows no contact."
      onClick={() =>
        run(() => startResearch(ids), ids.length > 1 ? `Research started for ${ids.length} prospects` : "Research started", () => {
          onDone?.();
          router.refresh();
        })
      }
    >
      <ScanSearch /> {running ? "Researching…" : "Research"}
    </Button>
  );
}

/** While a run is going, checks every few seconds and reloads the page when it ends. */
export function ResearchWatcher({ companyId }: { companyId: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(async () => {
      const res = await researchState(companyId).catch(() => null);
      if (res?.value && !res.value.running) {
        clearInterval(t);
        router.refresh();
      }
    }, 3000);
    return () => clearInterval(t);
  }, [companyId, router]);
  return null;
}

/** Puts a found email or phone on the company. */
export function UseFindingButton({ companyId, kind, value }: { companyId: number; kind: "email" | "phone"; value: string }) {
  const [pending, run] = useRun();
  return (
    <Button variant="ghost" size="sm" className="h-6 px-1.5 text-xs" pending={pending} onClick={() => run(() => applyFinding(companyId, kind, value), `Company ${kind} updated`)}>
      <Check /> Use
    </Button>
  );
}
