"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { askReset } from "./actions";

export function ForgotForm() {
  const [state, action, pending] = useActionState(askReset, undefined);
  if (state?.sentTo) {
    return (
      <div className="grid gap-2 text-sm">
        <p>
          If <span className="font-medium">{state.sentTo}</span> has an account, a link to choose a new password is on its way. It works for an hour.
        </p>
        <p className="text-muted-foreground">Nothing after a few minutes? Check the spam folder, or ask your company&apos;s admin.</p>
      </div>
    );
  }
  return (
    <form action={action} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="email">Your email</Label>
        <Input id="email" name="email" type="email" autoComplete="username" required autoFocus />
      </div>
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" pending={pending} className="w-full">
        {pending ? "Sending…" : "Email me a link"}
      </Button>
    </form>
  );
}
