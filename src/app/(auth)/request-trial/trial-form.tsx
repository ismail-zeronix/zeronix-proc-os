"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { requestTrial } from "./actions";

const SIZES = ["1-5", "6-20", "21-50", "51+"];

export function TrialForm() {
  const [state, action, pending] = useActionState(requestTrial, undefined);
  if (state?.done !== undefined) {
    return (
      <div className="grid gap-2 text-sm">
        <p className="font-medium">Thank you. Your request is in.</p>
        <p className="text-muted-foreground">
          We will be in touch{state.done ? ` at ${state.done}` : ""} within one working day with a link to set up your account.
        </p>
      </div>
    );
  }
  return (
    <form action={action} className="grid gap-3">
      <div className="grid gap-1.5">
        <Label htmlFor="company">Company name</Label>
        <Input id="company" name="company" required autoFocus autoComplete="organization" maxLength={160} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="contactName">Your name</Label>
        <Input id="contactName" name="contactName" required autoComplete="name" maxLength={120} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="email">Work email</Label>
        <Input id="email" name="email" type="email" required autoComplete="email" maxLength={200} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="phone">Phone (optional)</Label>
          <Input id="phone" name="phone" type="tel" autoComplete="tel" maxLength={40} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="teamSize">Team size</Label>
          <select id="teamSize" name="teamSize" className="h-9 rounded-md border bg-background px-2 text-sm" defaultValue="">
            <option value="">Choose</option>
            {SIZES.map((s) => (
              <option key={s} value={s}>
                {s} people
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="message">What does your company do? (optional)</Label>
        <Textarea id="message" name="message" rows={2} maxLength={600} />
      </div>
      {/* not for people: bots fill every field */}
      <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      <label className="flex items-start gap-2 text-xs text-muted-foreground">
        <input type="checkbox" name="agree" required className="mt-0.5" />
        <span>
          I accept the{" "}
          <a href="/legal/terms" target="_blank" className="underline">
            terms of service
          </a>{" "}
          and the{" "}
          <a href="/legal/privacy" target="_blank" className="underline">
            privacy notice
          </a>
          .
        </span>
      </label>
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" pending={pending} className="w-full">
        {pending ? "Sending…" : "Request a free trial"}
      </Button>
    </form>
  );
}
