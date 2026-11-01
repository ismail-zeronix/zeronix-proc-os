"use client";

import { Sparkles } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { addStarter } from "./actions";

/** Shown on the Overview while the catalog is empty: adds the 12 industries, 4 categories and the brands. */
export function StarterButton() {
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      pending={pending}
      onClick={() =>
        start(async () => {
          const res = await addStarter();
          if (res.error !== undefined) return void toast.error(res.error);
          toast.success(res.value.added ? `Added ${res.value.added} industries, categories and brands` : "Everything was already there");
        })
      }
    >
      <Sparkles /> Add starter catalog
    </Button>
  );
}
