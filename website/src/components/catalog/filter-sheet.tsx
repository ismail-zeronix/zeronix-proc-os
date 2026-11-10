"use client";

import { SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

/**
 * Phones and tablets: a "Filters" button that opens the filter column (server-rendered `children`, plain links) in a
 * sheet from the bottom. Following a link closes it. On desktop the same column sits next to the grid instead.
 */
export function FilterSheet({ active, children }: { active: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <button
            type="button"
            className="inline-flex h-9 items-center gap-2 rounded-full border border-line bg-white px-4 text-sm font-semibold text-brand-900 transition-colors hover:border-brand-700/40 lg:hidden"
          />
        }
      >
        <SlidersHorizontal className="size-4" />
        Filters
        {active > 0 && <span className="grid min-w-5 place-items-center rounded-full bg-brand-900 px-1 text-[0.6875rem] leading-5 text-white">{active}</span>}
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto rounded-t-3xl bg-canvas">
        <SheetHeader>
          <SheetTitle>Filters</SheetTitle>
        </SheetHeader>
        <div
          className="px-4 pb-6"
          onClick={(e) => {
            if ((e.target as HTMLElement).closest("a")) setOpen(false);
          }}
        >
          {children}
        </div>
      </SheetContent>
    </Sheet>
  );
}
