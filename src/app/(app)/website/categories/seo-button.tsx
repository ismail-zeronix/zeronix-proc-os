"use client";

import { Presentation } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { addSeoCategoriesAction } from "../actions";

/** Shown until they exist: adds Networking and the video conferencing categories (SEO audit), published. */
export function SeoCategoriesButton() {
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      pending={pending}
      onClick={() =>
        start(async () => {
          const res = await addSeoCategoriesAction();
          if (res.error !== undefined) return void toast.error(res.error);
          toast.success(`Added ${res.value.categories} categories: Networking and video conferencing. Add products to them from Website › Products.`);
        })
      }
    >
      <Presentation /> Add networking and meeting room categories
    </Button>
  );
}
