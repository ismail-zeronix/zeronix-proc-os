"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // clipboard API needs https / localhost: fall back for plain-http intranet installs
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    if (!ok) throw new Error("copy failed");
  }
}

export function CopyButton({
  text,
  label = "Copy",
  size = "sm",
  variant = "outline",
  iconOnly = false,
}: {
  text: string | (() => string);
  label?: string;
  size?: "xs" | "sm" | "default";
  variant?: "outline" | "ghost" | "secondary";
  /** Just the icon (the label becomes its tooltip and screen-reader name). */
  iconOnly?: boolean;
}) {
  const [done, setDone] = useState(false);
  return (
    <Button
      variant={variant}
      size={iconOnly ? "icon-sm" : size}
      title={label}
      aria-label={label}
      onClick={async () => {
        try {
          await copyText(typeof text === "function" ? text() : text);
          setDone(true);
          toast.success("Copied");
          setTimeout(() => setDone(false), 1500);
        } catch {
          toast.error("Could not copy. Select the text and copy it by hand.");
        }
      }}
    >
      {done ? <Check /> : <Copy />} {!iconOnly && label}
    </Button>
  );
}
