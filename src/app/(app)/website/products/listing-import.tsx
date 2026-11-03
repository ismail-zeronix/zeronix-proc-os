"use client";

import { ClipboardPaste } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { parseJsonValues, readListing, type ListingRead } from "@/lib/website/listing-import";
import { importListingAction } from "../catalog-actions";

const BATCH = 40;

/**
 * "Import listing": paste a shop's category-page JSON (several pages one after another is fine). It is read here in the
 * browser; only the facts (part number, name, specs, category, price) go to the portal, in batches, and become drafts.
 */
export function ListingImport({ markup }: { markup: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [done, setDone] = useState(0);
  const [pending, start] = useTransition();

  const read = useMemo((): ListingRead | { error: string } | null => {
    if (!text.trim()) return null;
    try {
      return readListing(parseJsonValues(text));
    } catch (e) {
      return { error: (e as Error).message };
    }
  }, [text]);

  const run = (items: ListingRead["items"], skipped: string[]) =>
    start(async () => {
      const total = { added: 0, priced: 0, unchanged: 0, queued: 0, warnings: new Set<string>() };
      for (let i = 0; i < items.length; i += BATCH) {
        const res = await importListingAction(items.slice(i, i + BATCH));
        if (res.error !== undefined) {
          toast.error(`Stopped after ${i} products: ${res.error}`);
          break;
        }
        total.added += res.value.added;
        total.priced += res.value.priced;
        total.unchanged += res.value.unchanged;
        total.queued += res.value.queued;
        res.value.warnings.forEach((w) => total.warnings.add(w));
        setDone(Math.min(i + BATCH, items.length));
      }
      const notes = [...(total.queued ? [`Pictures for ${total.queued} product(s) are fetched in the background over the next minutes.`] : []), ...total.warnings, ...(skipped.length ? [`${skipped.length} skipped: ${skipped.slice(0, 3).join("; ")}`] : [])];
      toast.success(`${total.added} added as drafts · ${total.priced} price updated · ${total.unchanged} unchanged`, { description: notes.join(" ") || undefined, duration: notes.length ? 15000 : 5000 });
      setText("");
      setDone(0);
      setOpen(false);
      router.refresh();
    });

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
      <DialogTrigger
        render={
          <Button size="sm" variant="outline">
            <ClipboardPaste /> Import listing
          </Button>
        }
      />
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import listing</DialogTitle>
          <DialogDescription>
            Paste a category page&apos;s JSON (several pages one after another is fine). Each product becomes a draft with its part number, specs and price, and its pictures are fetched from the product page in the background. A part
            number already here only gets the new price.
          </DialogDescription>
        </DialogHeader>
        <Textarea rows={12} value={text} onChange={(e) => setText(e.target.value)} placeholder='[{ "category": { … }, "products": [ … ] }]' className="max-h-[50svh] font-mono text-xs" disabled={pending} />
        <p className="text-xs text-muted-foreground">
          Prices get the store markup of <span className="font-semibold text-foreground">{markup}%</span>, rounded up to end in 9 (change it in Website › Settings › Store).
        </p>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          {read && "error" in read && <span className="text-red-700 dark:text-red-400">{read.error}</span>}
          {read && "items" in read && (
            <span className="text-muted-foreground">
              {read.items.length} products found
              {read.skipped.length > 0 && ` · ${read.skipped.length} without a part number`}
              {pending && ` · imported ${done} of ${read.items.length}`}
            </span>
          )}
          <Button className="ml-auto" pending={pending} disabled={!read || "error" in read || !read.items.length} onClick={() => read && "items" in read && run(read.items, read.skipped)}>
            Import {read && "items" in read && read.items.length ? read.items.length : ""} products
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
