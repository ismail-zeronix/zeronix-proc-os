"use client";

import { CopyButton } from "@/components/copy-button";

/**
 * A fresh invitation link: shown once (only its hash is kept). When the platform mailbox is set up it was also emailed
 * to the person (`emailedTo`); otherwise it is copied into WhatsApp or an email by hand.
 */
export function InviteLink({ url, expiresAt, emailedTo }: { url: string; expiresAt: string; emailedTo?: string | null }) {
  return (
    <div className="grid gap-2 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm dark:border-emerald-800 dark:bg-emerald-950/40">
      <div className="font-medium">Invitation link (shown once, works until {new Date(expiresAt).toLocaleString("en-GB", { timeZone: "Asia/Dubai" })})</div>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded bg-background px-2 py-1 text-xs">{url}</code>
        <CopyButton text={url} label="Copy link" />
      </div>
      <p className="text-xs text-muted-foreground">
        {emailedTo
          ? `Emailed to ${emailedTo}. You can also send the link yourself. They choose their own password when they open it.`
          : "Not emailed (no platform mailbox is set up, or the email failed): send the link yourself. They choose their own password when they open it."}
      </p>
    </div>
  );
}
