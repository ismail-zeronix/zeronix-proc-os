"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Trash2 } from "lucide-react";
import Link from "next/link";
import { BackButton } from "@/components/back-button";
import { useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { OfferDraft } from "@/lib/offer-draft";
import { useReviewStore } from "@/stores/import-store";
import { deletePriceList, savePriceList } from "../actions";
import { ReviewGrid } from "./review-grid";
import { errorText } from "@/lib/user-error";

export interface PriceListDto {
  id: number;
  supplierId: number;
  supplierName: string;
  status: "queued" | "parsing" | "review" | "saved" | "failed";
  progressDone: number;
  progressTotal: number;
  source: "paste" | "excel" | "feed" | "whatsapp";
  /** WhatsApp group or chat and the sender as shown there (Claude's pushes). */
  chat: string;
  sender: string;
  sourceName: string;
  error: string | null;
  model: string | null;
  parseMs: number | null;
  receivedAt: string;
  rawText: string;
  drafts: OfferDraft[];
}

export function ReviewClient({ id }: { id: number }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [pending, start] = useTransition();
  const { data, isLoading, error } = useQuery<PriceListDto>({
    queryKey: ["price-list", id],
    queryFn: async () => {
      const res = await fetch(`/api/price-lists/${id}`);
      if (!res.ok) throw new Error(res.status === 404 ? "Price list not found" : `HTTP ${res.status}`);
      return res.json();
    },
  });

  const drafts = useReviewStore((s) => s.drafts[id]);
  const init = useReviewStore((s) => s.init);
  const removeLocal = useReviewStore((s) => s.remove);

  useEffect(() => {
    if (data?.status === "review") init(id, data.drafts);
  }, [data?.status, data?.drafts, id, init]);

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (error || !data) return <p className="text-sm text-destructive">{(error as Error)?.message ?? "Not found"}</p>;

  const header = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <BackButton fallback="/procurement/price-lists" />
      <h1 className="text-lg font-semibold tracking-tight">
        <Link href={`/procurement/suppliers/${data.supplierId}`} className="hover:underline">
          {data.supplierName}
        </Link>
      </h1>
      <StatusBadge status={data.status} />
      <span className="min-w-0 truncate text-xs text-muted-foreground">
        Received {new Date(data.receivedAt).toLocaleString()} · list #{data.id}
        {data.source === "excel"
          ? ` · Excel: ${data.sourceName}`
          : data.source === "feed"
            ? " · Live feed"
            : data.source === "whatsapp"
              ? ` · WhatsApp${data.chat ? `: ${data.chat}` : ""}${data.sender && data.sender !== data.chat ? ` (${data.sender})` : ""}`
              : ""}
      </span>
    </div>
  );

  const remove = () =>
    start(async () => {
      if (!confirm("Delete this price list?")) return;
      try {
        await deletePriceList(id);
        removeLocal(id);
        router.push("/procurement/price-lists");
      } catch (e) {
        toast.error(errorText(e));
      }
    });

  if (data.status === "failed") {
    return (
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
        {header}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="size-4" /> Not read
            </CardTitle>
            <CardDescription className="break-words">{data.error}</CardDescription>
          </CardHeader>
          <CardContent className="flex gap-2">
            <Button variant="destructive" onClick={remove} pending={pending}>
              <Trash2 /> Delete
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (data.status === "saved") {
    const saved = data.drafts.filter((d) => d.include);
    return (
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
        {header}
        <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card px-3 py-2">
          <span className="flex items-center gap-2 text-sm font-medium">
            <CheckCircle2 className="size-4 text-emerald-600" /> Saved {saved.length} {saved.length === 1 ? "offer" : "offers"}
          </span>
          <span className="text-xs text-muted-foreground">They show in Search now.</span>
          <span className="ml-auto flex flex-wrap gap-1.5">
            <Button size="sm" nativeButton={false} render={<Link href="/procurement" />}>Search</Button>
            <Button size="sm" variant="outline" nativeButton={false} render={<Link href="/procurement/inbox" />}>Inbox</Button>
          </span>
        </div>
        <ReviewGrid id={id} rows={data.drafts} readOnly />
      </div>
    );
  }

  const save = () =>
    start(async () => {
      try {
        const rows = drafts ?? data.drafts;
        const res = await savePriceList(id, rows);
        removeLocal(id);
        toast.success(`Saved ${res.saved} ${res.saved === 1 ? "offer" : "offers"}`);
        await qc.invalidateQueries({ queryKey: ["price-list", id] });
        router.refresh();
      } catch (e) {
        toast.error(errorText(e));
      }
    });

  const rows = drafts ?? data.drafts;
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
      {header}
      <ReviewGrid
        id={id}
        rows={rows}
        onReset={() => init(id, data.drafts, true)}
        actions={
          <>
            <Button variant="ghost" onClick={remove} pending={pending}>
              <Trash2 /> Delete
            </Button>
            <Button onClick={save} pending={pending} disabled={!rows.some((r) => r.include)}>
              <CheckCircle2 /> Save {rows.filter((r) => r.include).length} {rows.filter((r) => r.include).length === 1 ? "offer" : "offers"}
            </Button>
          </>
        }
      />
    </div>
  );
}

function StatusBadge({ status }: { status: PriceListDto["status"] }) {
  const map = {
    queued: ["Not read", "secondary"],
    parsing: ["Not read", "secondary"],
    review: ["Needs a check", "default"],
    saved: ["Saved", "outline"],
    failed: ["Failed", "destructive"],
  } as const;
  const [label, variant] = map[status];
  return <Badge variant={variant}>{label}</Badge>;
}
