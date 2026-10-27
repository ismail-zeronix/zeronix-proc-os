"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changeMyPassword } from "./actions";

/** Change your own password: current one first, new one twice. */
export function PasswordForm() {
  const blank = { current: "", next: "", again: "" };
  const [f, setF] = useState(blank);
  const [pending, start] = useTransition();
  const mismatch = f.again.length > 0 && f.next !== f.again;
  const valid = f.current.length > 0 && f.next.length >= 8 && f.next === f.again;
  return (
    <form
      className="grid max-w-sm gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        start(async () => {
          try {
            await changeMyPassword({ current: f.current, next: f.next });
            setF(blank);
            toast.success("Password changed. Use the new one next time you sign in.");
          } catch (err) {
            toast.error((err as Error).message);
          }
        });
      }}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="pw-current">Current password</Label>
        <Input id="pw-current" type="password" autoComplete="current-password" value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="pw-next">New password</Label>
        <Input id="pw-next" type="password" autoComplete="new-password" value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} placeholder="at least 8 characters" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="pw-again">New password again</Label>
        <Input id="pw-again" type="password" autoComplete="new-password" value={f.again} onChange={(e) => setF({ ...f, again: e.target.value })} aria-invalid={mismatch} />
        {mismatch && <p className="text-xs text-destructive">The two new passwords are not the same.</p>}
      </div>
      <Button type="submit" className="w-fit" pending={pending} disabled={!valid}>
        Change password
      </Button>
    </form>
  );
}
