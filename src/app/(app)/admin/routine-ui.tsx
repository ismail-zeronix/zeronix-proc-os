"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TARGET_FIELDS, type TargetKey, type TargetOverride, type Targets } from "@/lib/routine";
import { errorText } from "@/lib/user-error";
import { saveTeamTargets, saveUserTargets } from "./routine-actions";

function useSave() {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<unknown>, ok: string) =>
    start(async () => {
      try {
        await fn();
        toast.success(ok);
      } catch (e) {
        toast.error(errorText(e));
      }
    });
  return [pending, run] as const;
}

const unit = (per: "day" | "week") => (per === "day" ? "a day" : "a week");

/** Admin › Settings › Sales targets: the team default. */
export function TeamTargetsCard({ targets, checkinMinutes }: { targets: Targets; checkinMinutes: number }) {
  const [every, setEvery] = useState(String(checkinMinutes));
  const [f, setF] = useState<Record<TargetKey, string>>(() => Object.fromEntries(TARGET_FIELDS.map((t) => [t.key, String(targets[t.key])])) as Record<TargetKey, string>);
  const [pending, run] = useSave();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sales targets</CardTitle>
        <CardDescription>
          The team default for everyone on the sales routine (sales users with the CRM app). Set a person&apos;s own numbers, or take them off the
          routine, on their page in Users. My Day measures against these; under the daily ones the end-of-day report asks why.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid max-w-3xl gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {TARGET_FIELDS.map((t) => (
            <div key={t.key} className="grid gap-1.5">
              <Label htmlFor={`tt-${t.key}`}>
                {t.label} {unit(t.per)}
              </Label>
              <Input id={`tt-${t.key}`} type="number" min={0} max={1000} inputMode="numeric" value={f[t.key]} onChange={(e) => setF({ ...f, [t.key]: e.target.value })} />
            </div>
          ))}
        </div>
        <div className="grid max-w-md gap-1.5">
          <Label htmlFor="tt-checkin">Check-in: ask &quot;what have you done?&quot; every (working minutes)</Label>
          <Input id="tt-checkin" type="number" min={0} max={600} step={15} inputMode="numeric" value={every} onChange={(e) => setEvery(e.target.value)} className="w-32" />
          <p className="text-xs text-muted-foreground">
            While punched in, the portal rings, asks out loud and waits for a short answer. It rings 3 times, 5 minutes apart; unanswered after
            15 minutes counts as missed and admins are told. 0 = off.
          </p>
        </div>
        <div>
          <Button
            pending={pending}
            onClick={() =>
              run(
                () => saveTeamTargets({ ...(Object.fromEntries(TARGET_FIELDS.map((t) => [t.key, Number(f[t.key] || 0)])) as Targets), checkinMinutes: Number(every || 0) }),
                "Targets saved",
              )
            }
          >
            Save
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/** Admin › Users › person: on the routine or not, and their own numbers (empty = the team's). */
export function UserTargetsCard({ userId, team, own, eligible }: { userId: number; team: Targets; own: TargetOverride | null; eligible: boolean }) {
  const [on, setOn] = useState(!own?.off);
  const [f, setF] = useState<Record<TargetKey, string>>(
    () => Object.fromEntries(TARGET_FIELDS.map((t) => [t.key, own?.[t.key] != null ? String(own[t.key]) : ""])) as Record<TargetKey, string>,
  );
  const [pending, run] = useSave();
  const value = (k: TargetKey) => (f[k].trim() === "" ? null : Number(f[k]));
  return (
    <div className="grid gap-3 rounded-xl border bg-card p-4 text-sm">
      {!eligible && (
        <p className="text-muted-foreground">
          Only sales users with the CRM app are on the sales routine (My Day targets, end-of-day report, nudges). This person is not.
        </p>
      )}
      <label className="flex items-center gap-2">
        <Checkbox checked={on} onCheckedChange={(v) => setOn(!!v)} disabled={!eligible} />
        <span>On the daily sales routine: targets, nudges, and an end-of-day report before punching out</span>
      </label>
      <div className="grid max-w-3xl gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {TARGET_FIELDS.map((t) => (
          <div key={t.key} className="grid gap-1.5">
            <Label htmlFor={`ut-${t.key}`}>
              {t.label} {unit(t.per)}
            </Label>
            <Input
              id={`ut-${t.key}`}
              type="number"
              min={0}
              max={1000}
              inputMode="numeric"
              value={f[t.key]}
              placeholder={`Team: ${team[t.key]}`}
              disabled={!on || !eligible}
              onChange={(e) => setF({ ...f, [t.key]: e.target.value })}
            />
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Leave a box empty to use the team target (Admin › Settings › Sales targets).</p>
      <div>
        <Button
          pending={pending}
          disabled={!eligible}
          onClick={() =>
            run(
              () =>
                saveUserTargets(userId, {
                  off: !on,
                  callsDay: value("callsDay"),
                  prospectsDay: value("prospectsDay"),
                  leadsWeek: value("leadsWeek"),
                  quotesWeek: value("quotesWeek"),
                }),
              "Saved",
            )
          }
        >
          Save
        </Button>
      </div>
    </div>
  );
}
