"use client";

import { useActionState, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { decideClaude } from "./actions";

export function ConsentForm(props: { userName: string; appName: string; host: string; loopback: boolean; askedWrite: boolean; hidden: Record<string, string> }) {
  const [state, action, pending] = useActionState(decideClaude, undefined);
  const [write, setWrite] = useState(props.askedWrite);

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        {/* eslint-disable-next-line @next/next/no-img-element -- a tiny static SVG, nothing to optimise */}
        <img src="/icons/zeronix-mark.svg" alt="" width={40} height={40} className="mb-2 size-10 rounded-lg" />
        <CardTitle className="text-xl">Connect {props.appName} to Zeronix OS</CardTitle>
        <CardDescription>
          {props.appName} will work as <b className="text-foreground">{props.userName}</b> and see the same data you see. After you allow it, you go back to{" "}
          <b className="text-foreground">{props.host}</b>.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="grid gap-4">
          {Object.entries(props.hidden).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          {write && <input type="hidden" name="write" value="on" />}
          {props.loopback && (
            <p className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              This returns to a program on your own computer (Claude Code). Only allow it if you started this connection yourself just now.
            </p>
          )}
          <div className="grid gap-3 rounded-md border p-3 text-sm">
            <label className="flex items-start gap-2">
              <Checkbox checked disabled className="mt-0.5" />
              <span className="grid gap-0.5">
                <span className="font-medium">Read</span>
                <span className="text-muted-foreground">What you can see in the portal: your deals, customers, quotes, orders, tasks and prices, and money and reports if you have Accounts.</span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-2">
              <Checkbox checked={write} onCheckedChange={(v) => setWrite(v === true)} className="mt-0.5" />
              <span className="grid gap-0.5">
                <span className="font-medium">Write</span>
                <span className="text-muted-foreground">
                  Add tasks and notes, update deals, add leads and customers, make draft quotes. Never deletes, never posts money, never emails customers.
                </span>
              </span>
            </label>
          </div>
          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
          <div className="flex gap-2">
            <Button type="submit" name="decision" value="deny" variant="outline" className="flex-1" disabled={pending}>
              Deny
            </Button>
            <Button type="submit" name="decision" value="allow" className="flex-1" pending={pending}>
              Allow
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Changes are saved in your name. An admin can disconnect it any time in Admin › Claude; changing your password disconnects it too.</p>
        </form>
      </CardContent>
    </Card>
  );
}
