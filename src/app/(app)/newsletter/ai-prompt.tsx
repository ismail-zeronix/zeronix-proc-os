"use client";

import { Copy, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { buildPrompt } from "@/lib/newsletter/prompt";
import type { NewsBrand } from "@/lib/newsletter/types";

/** A ready-made prompt for making the HTML code outside the portal, with two boxes to personalise it. */
export function AiPrompt({ brand, defaultOpen }: { brand: NewsBrand; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [topic, setTopic] = useState("");
  const [audience, setAudience] = useState("");
  const prompt = buildPrompt(brand, topic, audience);

  return (
    <section className="grid gap-3 rounded-xl border bg-card p-3">
      <button type="button" className="flex items-center gap-2 text-left text-sm font-medium" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Sparkles className="size-4 text-amber-500" /> Make the code with an AI tool
        <span className="ml-auto text-xs font-normal text-muted-foreground">{open ? "Hide" : "Show prompt"}</span>
      </button>
      {open && (
        <>
          <p className="text-xs text-muted-foreground">Copy this prompt into ChatGPT, Claude or any AI tool, then paste the HTML it gives you below. It tells the tool our colours, the safe layout and the merge tags, and not to invent prices or claims.</p>
          <div className="grid gap-1.5">
            <Label htmlFor="ap-topic" className="text-xs">
              What is the newsletter about?
            </Label>
            <Input id="ap-topic" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="For example: CCTV systems for warehouses, with a free site survey" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ap-aud" className="text-xs">
              Who will read it? (optional)
            </Label>
            <Input id="ap-aud" value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="For example: facility managers in Dubai and Sharjah" />
          </div>
          <Textarea readOnly rows={6} value={prompt} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} aria-label="Prompt for the AI tool" />
          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                void navigator.clipboard.writeText(prompt).then(
                  () => toast.success("Prompt copied"),
                  () => toast.error("Could not copy. Select the text and copy it by hand."),
                );
              }}
            >
              <Copy /> Copy prompt
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
