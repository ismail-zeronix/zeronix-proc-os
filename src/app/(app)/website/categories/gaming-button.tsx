"use client";

import { Gamepad2 } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { addGaming } from "../actions";

/** Shown until the gaming categories exist: adds them, the Zeronix brand and the five Zeronix Custom PCs (as drafts). */
export function GamingButton() {
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      pending={pending}
      onClick={() =>
        start(async () => {
          const res = await addGaming();
          if (res.error !== undefined) return void toast.error(res.error);
          toast.success(`Added ${res.value.categories} gaming categories and ${res.value.products} Zeronix builds (drafts: set the prices, then publish)`);
        })
      }
    >
      <Gamepad2 /> Add gaming section
    </Button>
  );
}
