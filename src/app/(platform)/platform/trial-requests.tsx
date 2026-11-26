"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { declineTrialAction } from "./actions";

export interface TrialRow {
  id: number;
  company: string;
  contactName: string;
  email: string;
  phone: string;
  teamSize: string;
  message: string;
  status: "new" | "approved" | "declined";
  orgId: number | null;
  createdAt: string;
}

const when = (d: string) => new Date(d).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Dubai" });

/** Trial requests from the sign-in page: review one (fills New organisation) or decline it. */
export function TrialRequests({ rows }: { rows: TrialRow[] }) {
  const [declining, setDeclining] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  return (
    <ul className="grid gap-px overflow-hidden rounded-lg border bg-border text-sm">
      {rows.map((r) => (
        <li key={r.id} className="grid gap-1 bg-card px-3 py-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-medium">{r.company}</span>
            <span className="text-muted-foreground">
              {r.contactName} · {r.email}
              {r.phone ? ` · ${r.phone}` : ""}
              {r.teamSize ? ` · team of ${r.teamSize}` : ""}
            </span>
            <span className="text-xs text-muted-foreground tabular-nums">{when(r.createdAt)}</span>
            <span className="ml-auto flex items-center gap-2">
              {r.status === "new" ? (
                <>
                  <Button size="sm" nativeButton={false} render={<Link href={`/platform/new?request=${r.id}`} />}>
                    Review and approve
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => (setDeclining(declining === r.id ? null : r.id), setReason(""))}>
                    Decline
                  </Button>
                </>
              ) : r.status === "approved" && r.orgId ? (
                <Link href={`/platform/tenants/${r.orgId}`} className="text-xs font-medium hover:underline">
                  Approved: open the company
                </Link>
              ) : (
                <span className="text-xs text-muted-foreground">{r.status === "approved" ? "Approved" : "Declined"}</span>
              )}
            </span>
          </div>
          {r.message && <p className="text-muted-foreground">{r.message}</p>}
          {declining === r.id && (
            <div className="flex flex-wrap items-center gap-2">
              <Input className="max-w-sm" placeholder="Why (only you see it)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
              <Button
                size="sm"
                variant="destructive"
                pending={pending}
                onClick={() =>
                  start(async () => {
                    const res = await declineTrialAction(r.id, reason);
                    if (!res.ok) return void toast.error(res.error);
                    setDeclining(null);
                    toast.success("Declined. Nothing was emailed.");
                  })
                }
              >
                Decline the request
              </Button>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
