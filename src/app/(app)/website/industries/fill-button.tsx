"use client";

import { FileText } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { fillIndustryPages } from "../actions";

/** Fills industry pages that are still empty with the starter copy; pages with any writing are not touched. */
export function FillButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      pending={pending}
      title="Adds an introduction, pain points, roles and FAQ to industry pages that have none yet"
      onClick={() =>
        start(async () => {
          const res = await fillIndustryPages();
          if (res.error !== undefined) return void toast.error(res.error);
          toast.success(res.value.filled ? `Filled ${res.value.filled} empty industry pages` : "Every industry page already has content");
          router.refresh();
        })
      }
    >
      <FileText /> Fill empty pages
    </Button>
  );
}
