import { MailWarning } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/** Shown instead of the inbox until the user has connected a working mailbox. */
export function MailNotReady({ paused, reason }: { paused: boolean; reason: string }) {
  return (
    <Card className="mx-auto mt-10 max-w-lg">
      <CardContent className="grid justify-items-center gap-3 py-10 text-center">
        <MailWarning className="size-8 text-muted-foreground" />
        <div>
          <p className="font-medium">{paused ? "Your mailbox is paused" : "Connect your mailbox first"}</p>
          <p className="text-sm text-muted-foreground">
            {paused ? reason || "Enter the mailbox password again." : "Add your email address and password once, then your inbox shows up here."}
          </p>
        </div>
        <Button nativeButton={false} render={<Link href="/account" />}>
          {paused ? "Reconnect mailbox" : "Connect mailbox"}
        </Button>
      </CardContent>
    </Card>
  );
}
