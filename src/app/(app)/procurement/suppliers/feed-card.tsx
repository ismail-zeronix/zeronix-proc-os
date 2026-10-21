"use client";

import { RefreshCw, Rss } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { CURRENCIES } from "@/lib/currency";
import { FEED_INTERVALS } from "@/lib/feed/intervals";
import { ago } from "@/lib/format";
import { removeFeed, saveFeed, syncFeedNow } from "./feed-actions";

export interface FeedInfo {
  url: string;
  currency: string;
  intervalMinutes: number;
  enabled: boolean;
  lastCheckedAt: string | null;
  lastChangedAt: string | null;
  lastRows: number;
  lastStatus: "never" | "unchanged" | "updated" | "error";
  lastMessage: string;
}

/** The live stock feed settings of one supplier (shown in a tab on the supplier page). */
export function FeedCard({ supplierId, feed, canEdit }: { supplierId: number; feed: FeedInfo | null; canEdit: boolean }) {
  const [pending, start] = useTransition();
  const [form, setForm] = useState({
    url: feed?.url ?? "",
    intervalMinutes: feed?.intervalMinutes ?? 60,
    currency: feed?.currency ?? "USD",
    enabled: feed?.enabled ?? true,
  });

  const run = (fn: () => Promise<{ status: string; message: string }>, done: string) =>
    start(async () => {
      try {
        const res = await fn();
        if (res.status === "error") toast.error(res.message);
        else toast.success(res.status === "unchanged" ? "Checked: no change" : `${done}: ${res.message}`);
      } catch (e) {
        toast.error((e as Error).message);
      }
    });

  const save = () =>
    run(() => saveFeed({ supplierId, ...form, currency: form.currency as (typeof CURRENCIES)[number] }), "Feed saved");

  return (
    <div className="grid max-w-3xl gap-3">
      <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
        <Rss className="size-4" /> Live stock feed
        <FeedBadge feed={feed} />
      </div>
      {feed && (
        <div className="grid gap-1 text-sm">
          <p className={feed.lastStatus === "error" ? "text-destructive" : "text-muted-foreground"}>
            {feed.lastStatus === "never" ? "Waiting for the first check…" : feed.lastMessage || "—"}
          </p>
          <p className="text-xs text-muted-foreground">
            {feed.lastCheckedAt ? `Checked ${ago(feed.lastCheckedAt)}` : "Not checked yet"}
            {feed.lastChangedAt ? ` · prices last changed ${ago(feed.lastChangedAt)}` : ""}
            {feed.lastRows ? ` · ${feed.lastRows} products` : ""}
          </p>
        </div>
      )}

      {canEdit ? (
        <>
          <div className="grid gap-3 sm:grid-cols-[1fr_170px_100px]">
            <div className="grid gap-1">
              <Label className="text-xs text-muted-foreground">Feed link</Label>
              <Input
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
                placeholder="https://stocksheet.example.app/ or a published Google Sheet link"
              />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs text-muted-foreground">Check</Label>
              <NativeSelect className="w-full" value={form.intervalMinutes} onChange={(e) => setForm({ ...form, intervalMinutes: Number(e.target.value) })}>
                {FEED_INTERVALS.map(([m, label]) => (
                  <NativeSelectOption key={m} value={m}>
                    {label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <div className="grid gap-1">
              <Label className="text-xs text-muted-foreground">Prices in</Label>
              <NativeSelect className="w-full" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
                {CURRENCIES.map((c) => (
                  <NativeSelectOption key={c} value={c}>
                    {c}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
          </div>
          <Label className="flex items-center gap-2 font-normal">
            <Checkbox checked={form.enabled} onCheckedChange={(c) => setForm({ ...form, enabled: !!c })} />
            Keep this supplier&apos;s prices updated automatically
          </Label>
          <div className="flex flex-wrap gap-2">
            <Button onClick={save} disabled={pending || form.url.trim().length < 8}>
              {feed ? "Save and check now" : "Start live feed"}
            </Button>
            {feed && (
              <>
                <Button variant="outline" disabled={pending} onClick={() => run(() => syncFeedNow(supplierId), "Updated")}>
                  <RefreshCw className={pending ? "animate-spin" : ""} /> Check now
                </Button>
                <Button
                  variant="ghost"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      await removeFeed(supplierId);
                      toast.success("Live feed removed. Saved lists are kept.");
                    })
                  }
                >
                  Stop feed
                </Button>
              </>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            A new price list is saved only when the supplier&apos;s sheet changes. Products that disappear from the sheet are
            marked out of stock. No AI is used, so this does not load the local model.
          </p>
        </>
      ) : (
        !feed && <p className="text-sm text-muted-foreground">No live feed. An admin can connect one.</p>
      )}
    </div>
  );
}

/** Small status pill for a feed (also used on the tab label). */
export function FeedBadge({ feed }: { feed: FeedInfo | null }) {
  if (!feed) return null;
  if (feed.lastStatus === "error") return <Badge variant="destructive">Problem</Badge>;
  if (!feed.enabled) return <Badge variant="outline">Paused</Badge>;
  return <Badge variant="secondary">Live</Badge>;
}
