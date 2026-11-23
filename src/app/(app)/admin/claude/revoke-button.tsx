"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { errorText } from "@/lib/user-error";
import { revokeClaude } from "./actions";

export function RevokeButton({ id, who }: { id: number; who: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      pending={pending}
      onClick={() => {
        if (!confirm(`Disconnect Claude for ${who}? Claude will ask them to sign in again.`)) return;
        start(async () => {
          try {
            await revokeClaude(id);
            toast.success("Disconnected");
          } catch (e) {
            toast.error(errorText(e));
          }
        });
      }}
    >
      Disconnect
    </Button>
  );
}
