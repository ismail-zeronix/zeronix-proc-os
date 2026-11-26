"use client";

import { Play, Square } from "lucide-react";
import { AppLink } from "@/components/app-link";
import { useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FEED_INTERVALS } from "@/lib/feed/intervals";
import { ago } from "@/lib/format";
import { syncFeedNow } from "../procurement/suppliers/feed-actions";
import { setFeedSchedule } from "./actions";
import { errorText } from "@/lib/user-error";

function useAction() {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<unknown>, ok?: string) =>
    start(async () => {
      try {
        await fn();
        if (ok) toast.success(ok);
      } catch (e) {
        toast.error(errorText(e));
      }
    });
  return [pending, run] as const;
}

/** The offered intervals, plus the current value if it is not one of them (e.g. set from the supplier page). */
function withCurrent(list: readonly (readonly [number, string])[], minutes: number): (readonly [number, string])[] {
  return list.some(([m]) => m === minutes) ? [...list] : [[minutes, `Every ${minutes} min`], ...list];
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
            <Table cards>
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
