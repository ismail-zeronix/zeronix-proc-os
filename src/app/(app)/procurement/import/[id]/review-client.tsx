"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Loader2, RotateCcw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { OfferDraft } from "@/lib/llm/schema";
import { useReviewStore } from "@/stores/import-store";
import { deletePriceList, reparsePriceList, savePriceList } from "../actions";
import { ReviewGrid } from "./review-grid";

export interface PriceListDto {
  id: number;
  supplierId: number;
  supplierName: string;
  status: "queued" | "parsing" | "review" | "saved" | "failed";
  progressDone: number;
  progressTotal: number;
  reusedBlocks: number;
  /** Has an admin started AI reading? When not, queued lists wait. */
  aiRunning?: boolean;
  source: "paste" | "excel" | "feed";
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
    refetchInterval: (q) => (q.state.data && ["queued", "parsing"].includes(q.state.data.status) ? 2500 : false),
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
    <PageHeader
      back={{ href: "/procurement/price-lists", label: "Price lists" }}
      title={
        <span className="flex flex-wrap items-center gap-3">
          <Link href={`/procurement/suppliers/${data.supplierId}`} className="hover:underline">
            {data.supplierName}
          </Link>
          <StatusBadge status={data.status} />
        </span>
      }
      description={
        <>
          Received {new Date(data.receivedAt).toLocaleString()} · price list #{data.id}
          {data.source === "excel" ? ` · Excel: ${data.sourceName}` : data.source === "feed" ? " · Live feed" : data.model ? ` · read by ${data.model}` : ""}
          {data.source === "paste" && data.parseMs ? ` in ${Math.round(data.parseMs / 1000)}s` : ""}
          {data.reusedBlocks > 0 ? ` · ${data.reusedBlocks} item${data.reusedBlocks === 1 ? "" : "s"} already known, AI skipped` : ""}
        </>
      }
    />
  );

  const reparse = () =>
    start(async () => {
      removeLocal(id);
      await reparsePriceList(id);
      await qc.invalidateQueries({ queryKey: ["price-list", id] });
    });

  const remove = () =>
    start(async () => {
      if (!confirm("Delete this price list?")) return;
      try {
        await deletePriceList(id);
        removeLocal(id);
        router.push("/procurement/price-lists");
      } catch (e) {
        toast.error((e as Error).message);
      }
    });

  if (data.status === "queued" || data.status === "parsing") {
    const pct = data.progressTotal ? Math.round((data.progressDone / data.progressTotal) * 100) : 0;
    return (
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
        {header}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" />
              {data.status === "queued" ? "Waiting in queue…" : "AI is reading the message…"}
            </CardTitle>
            <CardDescription>
              {data.status === "queued" && data.aiRunning === false
                ? "AI reading is stopped, so this list waits. An admin can start it from the Admin page. You can leave this page and come back from Price lists."
                : "Runs on the local model in the background. You can leave this page and come back from Price lists. A long list can take several minutes on a CPU-only server."}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
            </div>
            <p className="text-xs text-muted-foreground">
              {data.progressDone} / {data.progressTotal || "?"} blocks
            </p>
            <pre className="mt-2 max-h-72 overflow-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap">
              {data.rawText}
            </pre>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (data.status === "failed") {
    return (
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
        {header}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="size-4" /> Reading failed
            </CardTitle>
            <CardDescription className="break-words">{data.error}</CardDescription>
          </CardHeader>
          <CardContent className="flex gap-2">
            <Button onClick={reparse} disabled={pending}>
              <RotateCcw /> Try again
            </Button>
            <Button variant="destructive" onClick={remove} disabled={pending}>
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
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
        {header}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="size-4 text-emerald-600" /> Saved {saved.length} offers
            </CardTitle>
            <CardDescription>These prices are now searchable on the Compare page.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button nativeButton={false} render={<Link href="/procurement/compare" />}>Compare prices</Button>
            <Button variant="outline" nativeButton={false} render={<Link href="/procurement/alerts" />}>
              See price changes
            </Button>
            <Button variant="outline" nativeButton={false} render={<Link href="/procurement/price-lists?status=review" />}>
              Next list to review
            </Button>
            <Button variant="outline" nativeButton={false} render={<Link href="/procurement/import" />}>
              Paste another list
            </Button>
          </CardContent>
        </Card>
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
        toast.success(
          `Saved ${res.saved} offers${res.learned ? `. Learned from ${res.learned} correction${res.learned > 1 ? "s" : ""}` : ""}`,
        );
        await qc.invalidateQueries({ queryKey: ["price-list", id] });
        router.refresh();
      } catch (e) {
        toast.error((e as Error).message);
      }
    });

  const rows = drafts ?? data.drafts;
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
      {header}
      <ReviewGrid
        id={id}
        rows={rows}
        onReset={() => init(id, data.drafts, true)}
        actions={
          <>
            <Button variant="ghost" onClick={remove} disabled={pending}>
              <Trash2 /> Delete
            </Button>
            <Button variant="outline" onClick={reparse} disabled={pending}>
              <RotateCcw /> Re-read with AI
            </Button>
            <Button onClick={save} disabled={pending || !rows.some((r) => r.include)}>
              <CheckCircle2 /> Save {rows.filter((r) => r.include).length} offers
            </Button>
          </>
        }
      />
    </div>
  );
}

function StatusBadge({ status }: { status: PriceListDto["status"] }) {
  const map = {
    queued: ["Queued", "secondary"],
    parsing: ["Reading", "secondary"],
    review: ["Needs review", "default"],
    saved: ["Saved", "outline"],
    failed: ["Failed", "destructive"],
  } as const;
  const [label, variant] = map[status];
  return <Badge variant={variant}>{label}</Badge>;
}
