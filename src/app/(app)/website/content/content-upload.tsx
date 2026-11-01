"use client";

import { Plus, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { importPostAction, newPostAction } from "../content-actions";

/** Upload one or more posts (.md, or .zip with pictures). A single upload opens the draft straight away. */
export function ContentUpload() {
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
        const res = await importPostAction(form);
        if (res.error !== undefined) {
          toast.error(`${file.name}: ${res.error}`);
          continue;
        }
        last = res.value.id;
        const what = res.value.created ? "added as a draft" : res.value.status === "published" ? "updated on the site" : "updated";
        toast.success(`${file.name}: ${what}`, { description: res.value.warnings.join(" ") || undefined, duration: res.value.warnings.length ? 15000 : 4000 });
      }
      if (input.current) input.current.value = "";
      if (files.length === 1 && last) router.push(`/website/content/${last}`);
      else router.refresh();
    });
  return (
    <>
      <input ref={input} type="file" accept=".md,.zip,text/markdown,application/zip" multiple hidden onChange={(e) => upload(e.target.files)} />
      <Button size="sm" pending={pending} onClick={() => input.current?.click()}>
        <Upload /> Upload .md / .zip
      </Button>
    </>
  );
}

export function NewPostButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      pending={pending}
      onClick={() =>
        start(async () => {
          const res = await newPostAction();
          if (res.error !== undefined) return void toast.error(res.error);
          router.push(`/website/content/${res.value}`);
        })
      }
    >
      <Plus /> New post
    </Button>
  );
}
