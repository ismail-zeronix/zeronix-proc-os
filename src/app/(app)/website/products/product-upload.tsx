"use client";

import { Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { importProductAction } from "../catalog-actions";

/** "Upload .md": one or more product files from the research; each becomes a draft (or updates the same part number). */
export function ProductUpload() {
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [pending, start] = useTransition();
  const upload = (files: FileList | null) =>
    files?.length &&
    start(async () => {
      let last = 0;
      for (const file of [...files]) {
        const form = new FormData();
        form.set("file", file);
        const res = await importProductAction(form);
        if (res.error !== undefined) {
          toast.error(`${file.name}: ${res.error}`);
          continue;
        }
        last = res.value.id;
        toast.success(`${file.name}: ${res.value.created ? "added as a draft" : "updated"}`, { description: res.value.warnings.join(" ") || undefined, duration: res.value.warnings.length ? 12000 : 4000 });
      }
      if (input.current) input.current.value = "";
      if (files.length === 1 && last) router.push(`/website/products/${last}`);
      else router.refresh();
    });
  return (
    <>
      <input ref={input} type="file" accept=".md,text/markdown" multiple hidden onChange={(e) => upload(e.target.files)} />
      <Button size="sm" pending={pending} onClick={() => input.current?.click()}>
        <Upload /> Upload .md
      </Button>
    </>
  );
}
