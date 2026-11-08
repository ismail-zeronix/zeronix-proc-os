"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { joinWithInvite } from "./actions";

export function JoinForm({ token, name }: { token: string; name: string }) {
  const [state, action, pending] = useActionState(joinWithInvite, undefined);
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="token" value={token} />
      <div className="grid gap-2">
        <Label htmlFor="name">Your name</Label>
        <Input id="name" name="name" defaultValue={name} required autoFocus autoComplete="name" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="password">Choose a password</Label>
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required placeholder="at least 8 characters" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="again">Password again</Label>
        <Input id="again" name="again" type="password" autoComplete="new-password" minLength={8} required />
      </div>
      <p className="text-xs text-muted-foreground">
        By joining you accept the{" "}
        <a href="/legal/terms" target="_blank" className="underline">
          terms of service
        </a>{" "}
        and the{" "}
        <a href="/legal/privacy" target="_blank" className="underline">
          privacy notice
        </a>
        .
      </p>
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" pending={pending} className="w-full">
        {pending ? "Joining…" : "Join and sign in"}
      </Button>
    </form>
  );
}
