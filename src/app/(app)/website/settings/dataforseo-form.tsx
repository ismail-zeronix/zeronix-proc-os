"use client";

import { CheckCircle2, CircleAlert, PlugZap } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { saveDfsAction, testDfsAction } from "../dataforseo-actions";

export interface DfsView {
  login: string;
  connected: boolean;
  budgetUsd: number;
  spentUsd: number;
  competitors: string[];
  lastError: string;
}

/** DataForSEO: API login (password write-only), monthly budget, competitor domains. Feeds Website › SEO › Rankings. */
export function DataForSeoForm({ dfs, canEdit }: { dfs: DfsView; canEdit: boolean }) {
  const router = useRouter();
  const [login, setLogin] = useState(dfs.login);
  const [password, setPassword] = useState("");
  const [budget, setBudget] = useState(String(dfs.budgetUsd));
  const [competitors, setCompetitors] = useState(dfs.competitors.join("\n"));
  const [saving, startSave] = useTransition();
  const [testing, startTest] = useTransition();

  return (
    <div className="grid gap-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        {dfs.connected && !dfs.lastError ? <CheckCircle2 className="size-4 text-emerald-600" aria-hidden /> : <CircleAlert className="size-4 text-amber-600" aria-hidden />}
        <span className="font-medium">{dfs.connected ? `Connected as ${dfs.login}` : "Not connected"}</span>
        {dfs.connected && (
          <span className="text-xs text-muted-foreground tabular-nums">
            USD {dfs.spentUsd.toFixed(2)} of {dfs.budgetUsd.toFixed(2)} spent this month
          </span>
        )}
      </div>
      {dfs.lastError && <p className="rounded-md bg-red-50 px-2 py-1 text-xs text-red-800 dark:bg-red-950/40 dark:text-red-300">{dfs.lastError}</p>}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="grid gap-1.5">
          <Label htmlFor="dfs-login">API login</Label>
          <Input id="dfs-login" value={login} disabled={!canEdit} onChange={(e) => setLogin(e.target.value)} placeholder="you@company.com" autoComplete="off" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="dfs-password">API password</Label>
          <Input id="dfs-password" type="password" value={password} disabled={!canEdit} onChange={(e) => setPassword(e.target.value)} placeholder={dfs.connected ? "Saved" : ""} autoComplete="new-password" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="dfs-budget">Monthly budget (USD)</Label>
          <Input id="dfs-budget" type="number" min={0} step={1} value={budget} disabled={!canEdit} onChange={(e) => setBudget(e.target.value)} />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        dataforseo.com › API Access gives the login and password (not your account password). Calls stop once the month&apos;s budget is reached; 0 switches them off. At live prices a weekly ranking check of 100 keywords is a few US dollars a month; each call&apos;s real cost is counted.
      </p>
      <div className="grid gap-1.5">
        <Label htmlFor="dfs-competitors">Competitor domains</Label>
        <Textarea id="dfs-competitors" rows={4} value={competitors} disabled={!canEdit} onChange={(e) => setCompetitors(e.target.value)} className="font-mono text-xs" />
        <p className="text-xs text-muted-foreground">One per line. Website › SEO › Rankings lists the searches they rank for in the UAE that we do not.</p>
      </div>
      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            pending={saving}
            onClick={() =>
              startSave(async () => {
                const res = await saveDfsAction({ login, password, budgetUsd: Number(budget) || 0, competitors });
                if (res.error !== undefined) return void toast.error(res.error);
                setPassword("");
                toast.success(`Saved, ${res.value.competitors} competitor domains`);
                router.refresh();
              })
            }
          >
            Save
          </Button>
          <Button
            size="sm"
            variant="outline"
            pending={testing}
            disabled={!dfs.connected}
            onClick={() =>
              startTest(async () => {
                const res = await testDfsAction();
                if (res.error !== undefined) return void toast.error(res.error);
                toast.success(res.value.balance === null ? "Works" : `Works: account balance USD ${res.value.balance.toFixed(2)}`);
                router.refresh();
              })
            }
          >
            <PlugZap /> Test
          </Button>
        </div>
      )}
    </div>
  );
}
