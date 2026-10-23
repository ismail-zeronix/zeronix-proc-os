"use client";

import { Plug, RefreshCw, Unplug } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { checkMailNow, connectMailbox, disconnectMailbox } from "./actions";

/** Connect, re-check or disconnect the signed-in user's mailbox. */
export function MailForm({ connected, imapUser, defaultEmail }: { connected: boolean; imapUser: string; defaultEmail: string }) {
  const [pending, start] = useTransition();
  const [email, setEmail] = useState(imapUser || defaultEmail);
  const [password, setPassword] = useState("");
  const [editing, setEditing] = useState(!connected);

  const run = (fn: () => Promise<unknown>, ok: string, after?: () => void) =>
    start(async () => {
      try {
        await fn();
        toast.success(ok);
        after?.();
      } catch (e) {
        toast.error((e as Error).message);
      }
    });

  if (connected && !editing) {
    return (
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" pending={pending} onClick={() => run(checkMailNow, "Inbox checked")}>
          <RefreshCw /> Check now
        </Button>
        <Button variant="outline" pending={pending} onClick={() => setEditing(true)}>
          <Plug /> Change password
        </Button>
        <Button
          variant="ghost"
          pending={pending}
          onClick={() =>
            confirm("Disconnect this mailbox? The saved login and message list are removed.") &&
            run(disconnectMailbox, "Mailbox disconnected")
          }
        >
          <Unplug /> Disconnect
        </Button>
      </div>
    );
  }

  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        run(
          () => connectMailbox({ email, password }),
          "Mailbox connected",
          () => {
            setPassword("");
            setEditing(false);
          },
        );
      }}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="mail-email">Email address</Label>
        <Input
          id="mail-email"
          type="email"
          autoComplete="off"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@zeronix.ae"
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="mail-password">Mailbox password</Label>
        <Input
          id="mail-password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Tested first, then saved encrypted. It is never shown again. If your mail provider offers an app password, use that.
        </p>
      </div>
      <div className="flex gap-2">
        <Button type="submit" pending={pending} disabled={!email || !password}>
          <Plug /> {pending ? "Testing…" : "Test and connect"}
        </Button>
        {connected && (
          <Button type="button" variant="ghost" pending={pending} onClick={() => setEditing(false)}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
