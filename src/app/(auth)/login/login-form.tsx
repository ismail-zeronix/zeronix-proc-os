"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { login } from "./actions";

export function LoginForm({ next, showLegal = false }: { next?: string; /** the SaaS install links its terms and privacy notice */ showLegal?: boolean }) {
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        {/* eslint-disable-next-line @next/next/no-img-element -- a tiny static SVG, nothing to optimise */}
        <img src="/icons/zeronix-mark.svg" alt="" width={40} height={40} className="mb-2 size-10 rounded-lg" />
        <CardTitle className="text-xl">Zeronix OS</CardTitle>
        <CardDescription>Sign in to continue.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="grid gap-4">
          <input type="hidden" name="next" value={next ?? ""} />
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="username" required autoFocus />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" autoComplete="current-password" required />
          </div>
          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
          <Button type="submit" pending={pending} className="w-full">
            {pending ? "Signing in…" : "Sign in"}
          </Button>
        </form>
        {showLegal && (
          <p className="mt-4 flex gap-3 text-xs text-muted-foreground">
            <a href="/legal/terms" className="hover:underline">
              Terms
            </a>
            <a href="/legal/privacy" className="hover:underline">
              Privacy
            </a>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
