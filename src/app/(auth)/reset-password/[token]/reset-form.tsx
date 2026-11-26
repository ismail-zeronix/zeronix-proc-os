"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setNewPassword } from "./actions";

export function ResetForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(setNewPassword, undefined);
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="token" value={token} />
      <div className="grid gap-2">
        <Label htmlFor="password">New password</Label>
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required autoFocus placeholder="at least 8 characters" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="again">New password again</Label>
        <Input id="again" name="again" type="password" autoComplete="new-password" minLength={8} required />
      </div>
      <p className="text-xs text-muted-foreground">You will be signed out on every other device.</p>
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" pending={pending} className="w-full">
        {pending ? "Saving…" : "Save the new password"}
      </Button>
    </form>
  );
}
