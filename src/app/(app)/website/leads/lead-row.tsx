"use client";

import { Ban, Handshake, Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { convertQuoteAction, setQuoteStatusAction } from "../lead-actions";

export function LeadActions({ id, status, dealId }: { id: number; status: string; dealId: number | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (dealId)
    return (
      <Button size="sm" variant="outline" nativeButton={false} render={<a href={`/crm/deals/${dealId}`} />}>
        <Handshake /> Open lead
      </Button>
    );
  return (
    <div className="flex items-start gap-2">
      {status === "new" ? (
        <>
          <Button
            size="sm"
            pending={pending}
            onClick={() =>
              start(async () => {
                const res = await convertQuoteAction(id);
                if (res.error !== undefined) return void toast.error(res.error);
                toast.success(res.value.reusedCompany ? `Lead saved under the existing company ${res.value.reusedCompany}` : "Saved to CRM leads");
                router.push(`/crm/deals/${res.value.dealId}`);
              })
            }
          >
            <Handshake /> Convert to lead
          </Button>
          <Button size="sm" variant="ghost" pending={pending} title="Not a real request" onClick={() => start(async () => void (await setQuoteStatusAction(id, "spam"), router.refresh()))}>
            <Ban /> Spam
          </Button>
        </>
      ) : (
        <Button size="sm" variant="ghost" pending={pending} onClick={() => start(async () => void (await setQuoteStatusAction(id, "new"), router.refresh()))}>
          <Undo2 /> Not spam
        </Button>
      )}
    </div>
  );
}
