"use client";

import { FileText } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { fillCategoryPages, fillIndustryPages } from "../actions";

const KINDS = {
  industry: { action: fillIndustryPages, title: "Adds an introduction, pain points, roles and FAQ to industry pages that have none yet" },
  category: { action: fillCategoryPages, title: "Adds buying advice, an FAQ and search text to category pages that have none yet" },
};

/** Fills industry or category pages that are still empty with the starter copy; pages with any writing are not touched. */
export function FillButton({ kind = "industry" }: { kind?: keyof typeof KINDS }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const { action, title } = KINDS[kind];
  return (
    <Button
      size="sm"
      variant="outline"
      pending={pending}
      title={title}
      onClick={() =>
        start(async () => {
          const res = await action();
          if (res.error !== undefined) return void toast.error(res.error);
          toast.success(res.value.filled ? `Filled ${res.value.filled} empty ${kind} pages` : `Every ${kind} page already has content`);
          router.refresh();
        })
      }
    >
      <FileText /> Fill empty pages
    </Button>
  );
}
