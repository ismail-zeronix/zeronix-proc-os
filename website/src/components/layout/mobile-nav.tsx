"use client";

import { Menu } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Action } from "@/components/brand/action";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { SiteIconLink, SiteNavLink, SiteNavResponse } from "@/lib/contract";
import { SiteIconView } from "@/lib/icons";

export function MobileNav({ nav, services, ctaLabel }: { nav: SiteNavResponse; services: SiteIconLink[]; ctaLabel: string }) {
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
                <Link key={x.slug} href={`${base}/${x.slug}`} onClick={close} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-surface-soft">
                  {x.icon && <SiteIconView name={x.icon} className="size-4 text-brand-700" />}
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
      <SheetTrigger render={<Button variant="ghost" size="icon" className="-ml-2 lg:hidden" aria-label="Open the menu" />}>
        <Menu />
      </SheetTrigger>
      <SheetContent side="right" className="w-full max-w-sm overflow-y-auto bg-canvas">
        <SheetHeader>
          <SheetTitle>Menu</SheetTitle>
        </SheetHeader>
        <nav className="grid gap-1 px-4 pb-6">
          <Accordion>
            {group("industries", "Industries", nav.industries, "/industries")}
            {group("products", "Products", nav.categories, "/products")}
            {services.length > 0 && (
              <AccordionItem value="services">
                <AccordionTrigger className="text-base">Services</AccordionTrigger>
                <AccordionContent>
                  <div className="grid gap-0.5">
                    {services.map((s) => (
                      <Link key={s.href} href={s.href} onClick={close} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-surface-soft">
                        {s.icon && <SiteIconView name={s.icon} className="size-4 text-brand-700" />}
                        {s.label}
                      </Link>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            )}
            {group("brands", "Brands", nav.brands, "/brands")}
          </Accordion>
          <Link href="/guides" onClick={close} className="py-3 text-base font-medium">
            Guides
          </Link>
          <Link href="/blog" onClick={close} className="py-3 text-base font-medium">
            Blog
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
