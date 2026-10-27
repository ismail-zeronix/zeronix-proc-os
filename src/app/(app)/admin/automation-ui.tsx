"use client";

import { Play, RefreshCw, Square } from "lucide-react";
import { AppLink } from "@/components/app-link";
import { useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AI_INTERVALS, FEED_INTERVALS } from "@/lib/feed/intervals";
import { ago } from "@/lib/format";
import { syncFeedNow } from "../procurement/suppliers/feed-actions";
import { requeueStuckLists, runAiNow, setAiInterval, setFeedSchedule, startAi, stopAi } from "./actions";

function useAction() {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<unknown>, ok?: string) =>
    start(async () => {
      try {
        await fn();
        if (ok) toast.success(ok);
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  return [pending, run] as const;
}

const hhmm = (d: Date) => d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

/** The offered intervals, plus the current value if it is not one of them (e.g. set from the supplier page). */
function withCurrent(list: readonly (readonly [number, string])[], minutes: number): (readonly [number, string])[] {
  return list.some(([m]) => m === minutes) ? [...list] : [[minutes, `Every ${minutes} min`], ...list];
}

export interface AiState {
  running: boolean;
  intervalMinutes: number;
  lastRunAt: string | null;
  /** When the next look is due (ISO), or null when stopped / due at the next tick. */
  nextLookAt: string | null;
  waiting: number;
  reading: number;
  modelLoaded: boolean;
  model: string;
}

export function AiControl({ ai }: { ai: AiState }) {
  const router = useRouter();
  const [pending, run] = useAction();
  const busy = ai.reading > 0;

  // keep the counts live while the AI is running or something is waiting
  useEffect(() => {
    if (!busy && !ai.waiting && !ai.running) return;
    const t = setInterval(() => router.refresh(), 6000);
    return () => clearInterval(t);
  }, [busy, ai.waiting, ai.running, router]);

  const nextLook = ai.nextLookAt ? hhmm(new Date(ai.nextLookAt)) : "Within a minute";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          AI reading
          {ai.running ? <Badge>Running</Badge> : <Badge variant="secondary">Stopped</Badge>}
        </CardTitle>
        <CardDescription>
          Pasted WhatsApp lists wait in a queue. While this is running, the local model reads the waiting lists on the
          interval below and then unloads itself. While it is stopped, the model stays out of memory. Excel imports and
          live feeds never use the model.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex flex-wrap items-end gap-3">
          {ai.running ? (
            <Button variant="destructive" pending={pending} onClick={() => run(() => stopAi(), "AI reading stopped")}>
              <Square /> Stop
            </Button>
          ) : (
            <Button pending={pending} onClick={() => run(() => startAi(), "AI reading started")}>
              <Play /> Start
            </Button>
          )}
          <div className="grid gap-1.5">
            <Label>Look for waiting lists</Label>
            <NativeSelect
              value={ai.intervalMinutes}
              disabled={pending}
              onChange={(e) => run(() => setAiInterval(Number(e.target.value)), "Interval saved")}
            >
              {withCurrent(AI_INTERVALS, ai.intervalMinutes).map(([m, label]) => (
                <NativeSelectOption key={m} value={m}>
                  {label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <Button
            variant="outline"
            pending={pending} disabled={ai.waiting === 0}
            onClick={() => run(() => runAiNow(), "Reading the waiting lists now")}
          >
            <RefreshCw className={busy ? "animate-spin" : ""} /> Read waiting lists now
          </Button>
        </div>

        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <Fact label="Waiting in queue" value={ai.waiting} />
          <Fact label="Being read now" value={ai.reading} />
          <Fact label={`Model (${ai.model})`} value={ai.modelLoaded ? "In memory" : "Not loaded"} />
          <Fact
            label={ai.running ? "Next look" : "Last look"}
            value={ai.running ? nextLook : ai.lastRunAt ? ago(ai.lastRunAt) : "Never"}
          />
        </dl>
        {busy && !ai.running && (
          <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {ai.reading} list{ai.reading === 1 ? " is" : "s are"} marked as being read. If nothing is happening (for example the
            server was restarted mid-read), put {ai.reading === 1 ? "it" : "them"} back in the queue.
            <Button
              variant="outline"
              size="sm"
              pending={pending}
              onClick={() => run(() => requeueStuckLists(), "Back in the queue")}
            >
              Requeue
            </Button>
          </p>
        )}
        {!ai.running && ai.waiting > 0 && (
          <p className="text-sm text-muted-foreground">
            {ai.waiting} list{ai.waiting === 1 ? " is" : "s are"} waiting. Press Start, or use “Read waiting lists now” for
            a single pass.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function Fact({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums" suppressHydrationWarning>{value}</dd>
    </div>
  );
}

export interface FeedRow {
  supplierId: number;
  supplier: string;
  intervalMinutes: number;
  enabled: boolean;
  lastCheckedAt: string | null;
  lastStatus: "never" | "unchanged" | "updated" | "error";
  lastMessage: string;
}

export function FeedSchedules({ feeds }: { feeds: FeedRow[] }) {
  const [pending, run] = useAction();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Live supplier feeds</CardTitle>
        <CardDescription>
          How often each supplier&apos;s published stock sheet is re-read. Connect a new feed on the supplier&apos;s page.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {feeds.length ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Check</TableHead>
                  <TableHead>Last check</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {feeds.map((f) => (
                  <TableRow key={f.supplierId}>
                    <TableCell className="max-w-[260px]">
                      <AppLink href={`/procurement/suppliers/${f.supplierId}`} className="block truncate font-medium hover:underline">
                        {f.supplier}
                      </AppLink>
                      {!f.enabled && <Badge variant="outline">Stopped</Badge>}
                    </TableCell>
                    <TableCell>
                      <NativeSelect
                        value={f.intervalMinutes}
                        disabled={pending}
                        onChange={(e) =>
                          run(() => setFeedSchedule(f.supplierId, { intervalMinutes: Number(e.target.value) }), "Interval saved")
                        }
                      >
                        {withCurrent(FEED_INTERVALS, f.intervalMinutes).map(([m, label]) => (
                          <NativeSelectOption key={m} value={m}>
                            {label}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                    </TableCell>
                    <TableCell className="max-w-[280px] text-xs">
                      <div className={f.lastStatus === "error" ? "text-destructive" : "text-muted-foreground"}>
                        {f.lastCheckedAt ? ago(f.lastCheckedAt) : "Not yet"}
                      </div>
                      <div className="truncate text-muted-foreground" title={f.lastMessage}>
                        {f.lastMessage}
                      </div>
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <Button
                        variant="outline"
                        size="sm"
                        pending={pending}
                        onClick={() =>
                          run(async () => {
                            const r = await syncFeedNow(f.supplierId);
                            if (r.status === "error") throw new Error(r.message);
                          }, "Checked")
                        }
                      >
                        Check now
                      </Button>{" "}
                      {f.enabled ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          pending={pending}
                          onClick={() => run(() => setFeedSchedule(f.supplierId, { enabled: false }), "Feed stopped")}
                        >
                          <Square /> Stop
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          pending={pending}
                          onClick={() => run(() => setFeedSchedule(f.supplierId, { enabled: true }), "Feed started")}
                        >
                          <Play /> Start
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No supplier has a live feed yet.</p>
        )}
      </CardContent>
    </Card>
  );
}
