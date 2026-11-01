"use client";

import { Menu } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Action } from "@/components/brand/action";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { SiteNavLink, SiteNavResponse } from "@/lib/contract";
import { SiteIconView } from "@/lib/icons";

export function MobileNav({ nav, ctaLabel }: { nav: SiteNavResponse; ctaLabel: string }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  const group = (value: string, label: string, items: SiteNavLink[], base: string) =>
    items.length > 0 && (
      <AccordionItem value={value}>
        <AccordionTrigger className="text-base">{label}</AccordionTrigger>
        <AccordionContent>
          <div className="grid gap-0.5">
            {items.map((x) => {
              return (
                <Link key={x.slug} href={`${base}/${x.slug}`} onClick={close} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-sage-50">
                  {x.icon && <SiteIconView name={x.icon} className="size-4 text-forest-700" />}
                  {x.name}
                </Link>
              );
            })}
          </div>
        </AccordionContent>
      </AccordionItem>
    );

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open the menu" />}>
        <Menu />
      </SheetTrigger>
      <SheetContent side="right" className="w-full max-w-sm overflow-y-auto bg-paper">
        <SheetHeader>
          <SheetTitle>Menu</SheetTitle>
        </SheetHeader>
        <nav className="grid gap-1 px-4 pb-6">
          <Accordion>
            {group("industries", "Industries", nav.industries, "/industries")}
            {group("products", "Products", nav.categories, "/products")}
            {group("brands", "Brands", nav.brands, "/brands")}
          </Accordion>
          <Link href="/guides" onClick={close} className="py-3 text-base font-medium">
            Guides
          </Link>
          <Link href="/about" onClick={close} className="py-3 text-base font-medium">
            About
          </Link>
          <span onClick={close} className="mt-4">
            <Action href="/quote" size="lg" className="w-full justify-between" track="mobile-nav">
              {ctaLabel}
            </Action>
          </span>
        </nav>
      </SheetContent>
    </Sheet>
  );
}
