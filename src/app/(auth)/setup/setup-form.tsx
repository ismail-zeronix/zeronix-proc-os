"use client";

import { useActionState } from "react";
import { PackageSearch, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createInitialAdmin } from "./actions";

export function SetupForm() {
  const [state, action, pending] = useActionState(createInitialAdmin, undefined);

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <PackageSearch className="size-5" />
        </div>
        <CardTitle className="text-xl">Welcome to Zeronix Procurement</CardTitle>
        <CardDescription>
          Let’s set up your administrator account. This page is available only until the first account is created.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Your name</Label>
            <Input id="name" name="name" autoComplete="name" minLength={2} maxLength={80} required autoFocus />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="email">Administrator email</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="password">Create password</Label>
            <Input id="password" name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required />
            <p className="text-xs text-muted-foreground">Use at least 12 characters.</p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="confirmPassword">Confirm password</Label>
            <Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" minLength={12} maxLength={128} required />
          </div>
          {state?.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Creating account…" : "Create administrator account"}
          </Button>
          <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="size-4" />
            One-time setup · password stored securely
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
