"use client";

import { Play } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { RuleConfig, RuleDef } from "@/lib/notifications/rules";
import { PRIORITY_DOT, PRIORITY_LABEL } from "@/lib/notifications/types";
import { runNotifyCheck, saveNotifyRules, setDigestSender } from "./notify-actions";

function NumberCell({ value, onChange, suffix, disabled }: { value: number; onChange: (v: number) => void; suffix: string; disabled?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1">
      <Input
        type="number"
        min={0}
        step="any"
        disabled={disabled}
        className="h-7 w-16 px-1.5 text-right"
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
      />
      <span className="text-xs text-muted-foreground">{suffix}</span>
    </span>
  );
}

/** Admin › Settings › Notifications: switch each alert rule on or off, set its limits, pick the digest mailbox. */
export function NotifySettings({
  rules,
  configs,
  mailboxes,
  digestFrom,
}: {
  rules: RuleDef[];
  configs: Record<string, RuleConfig>;
  mailboxes: { id: number; address: string; owner: string; enabled: boolean }[];
  digestFrom: string;
}) {
  const [f, setF] = useState(configs);
  const [pending, start] = useTransition();
  const [from, setFrom] = useState(Number(digestFrom) || 0);
  const set = (key: string, patch: Partial<RuleConfig>) => setF({ ...f, [key]: { ...f[key], ...patch } });
  const run = (fn: () => Promise<unknown>, ok: string | ((r: unknown) => string)) =>
    start(async () => {
      try {
        const r = await fn();
        toast.success(typeof ok === "string" ? ok : ok(r));
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  const unit = (r: RuleDef) => (r.mode === "date" ? "days" : r.unit === "days" ? "work days" : "work h");

  return (
    <div className="grid gap-3">
      <Card>
        <CardHeader>
          <CardTitle>Alert rules</CardTitle>
          <CardDescription>
            The portal checks these every 5 minutes and puts an alert in the right person&apos;s bell: a heads-up before the deadline, then
            overdue, then critical. Times count working hours only (Work hours tab). An alert clears by itself once the work is done.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="overflow-x-auto">
            <Table cards>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">On</TableHead>
                  <TableHead>Rule</TableHead>
                  <TableHead>Time limit</TableHead>
                  <TableHead>Heads-up before</TableHead>
                  <TableHead>Critical after</TableHead>
                  <TableHead>Goes to</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.map((r) => {
                  const c = f[r.key];
                  const off = !c.enabled;
                  return (
                    <TableRow key={r.key} className={off ? "opacity-60" : ""}>
                      <TableCell>
                        <Checkbox checked={c.enabled} onCheckedChange={(v) => set(r.key, { enabled: !!v })} aria-label={`${r.label} on`} />
                      </TableCell>
                      <TableCell className="max-w-72 whitespace-normal">
                        <div className="text-sm font-medium">{r.label}</div>
                        <div className="text-xs text-muted-foreground">{r.help}</div>
                        <div className="mt-0.5 flex gap-2 text-[11px] text-muted-foreground">
                          {(["warn", "due", "late"] as const).map((s) => (
                            <span key={s} className="inline-flex items-center gap-1">
                              <span className={`size-1.5 rounded-full ${PRIORITY_DOT[r.priority[s]]}`} />
                              {s === "warn" ? "Heads-up" : s === "due" ? "Due" : "Critical"}: {PRIORITY_LABEL[r.priority[s]]}
                            </span>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        {r.mode === "timer" ? (
                          <NumberCell value={c.limit} onChange={(v) => set(r.key, { limit: v })} suffix={unit(r)} disabled={off} />
                        ) : (
                          <span className="text-xs text-muted-foreground">{r.mode === "moment" ? "Time set on the deal" : "Date on the record"}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <NumberCell value={c.warn} onChange={(v) => set(r.key, { warn: v })} suffix={r.mode === "date" ? "days" : "hours"} disabled={off} />
                      </TableCell>
                      <TableCell>
                        <NumberCell value={c.escalate} onChange={(v) => set(r.key, { escalate: v })} suffix={r.mode === "moment" ? "work h" : unit(r)} disabled={off} />
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.to}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <p className="text-xs text-muted-foreground">0 = no heads-up / never critical. Date rules: a heads-up of 0 days means on the day itself.</p>
          <div className="flex flex-wrap gap-2">
            <Button pending={pending} onClick={() => run(() => saveNotifyRules(f), "Alert rules saved")}>
              Save rules
            </Button>
            <Button
              variant="outline"
              pending={pending}
              onClick={() =>
                run(runNotifyCheck, (r) => {
                  const x = r as { added: number; resolved: number };
                  return `Checked: ${x.added} new alert${x.added === 1 ? "" : "s"}, ${x.resolved} resolved`;
                })
              }
            >
              <Play /> Run check now
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Morning digest</CardTitle>
          <CardDescription>
            Each working morning everyone with open alerts gets one &quot;Your day&quot; email, and admins get a team summary of open critical and
            high alerts per person. Pick the mailbox it is sent from; with none, only the admins&apos; bell gets the summary.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-2">
          <div className="grid gap-1.5">
            <Label htmlFor="digest-from">Send from</Label>
            <NativeSelect id="digest-from" className="w-72" value={from} onChange={(e) => setFrom(Number(e.target.value))}>
              <NativeSelectOption value={0}>No emails</NativeSelectOption>
              {mailboxes.map((m) => (
                <NativeSelectOption key={m.id} value={m.id} disabled={!m.enabled}>
                  {m.address} ({m.owner}){m.enabled ? "" : ", paused"}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <Button variant="outline" pending={pending} onClick={() => run(() => setDigestSender(from), "Digest mailbox saved")}>
            Save
          </Button>
          {!mailboxes.length && <p className="w-full text-xs text-muted-foreground">No mailbox is connected yet: connect one under My account › Mailbox.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
