"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { CopyButton } from "@/components/copy-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createInviteLink } from "../actions";

/** Invite by link: the person opens it, sets their own password and is in. The link is shown once. */
export function InviteByLink() {
  const [f, setF] = useState({ email: "", name: "", role: "sales" as "admin" | "sales" });
  const [link, setLink] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <section className="grid gap-2 rounded-xl border bg-card p-3">
      <h2 className="text-sm font-medium">Invite by link</h2>
      <p className="text-xs text-muted-foreground">A one-time link (72 hours). Send it yourself on WhatsApp or by email; they choose their own password.</p>
      {link && (
        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 text-xs">{link}</code>
          <CopyButton text={link} label="Copy link" />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Input className="w-56" placeholder="Email" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        <Input className="w-44" placeholder="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <select className="h-8 rounded-md border bg-background px-2 text-sm" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as "admin" | "sales" })} aria-label="Role">
          <option value="sales">Staff</option>
          <option value="admin">Admin</option>
        </select>
        <Button
          size="sm"
          pending={pending}
          disabled={!f.email.includes("@")}
          onClick={() =>
            start(async () => {
              const r = await createInviteLink(f);
              if ("error" in r) return void toast.error(r.error);
              setLink(r.url);
              setF({ email: "", name: "", role: "sales" });
            })
          }
        >
          Make link
        </Button>
      </div>
    </section>
  );
}
