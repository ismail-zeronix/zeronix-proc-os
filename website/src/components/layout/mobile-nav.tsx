"use client";

import { ChevronRight, Gamepad2, Menu } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Action } from "@/components/brand/action";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { SiteIconLink, SiteNavLink, SiteNavResponse } from "@/lib/contract";
import { isGamingCategory } from "@/lib/gaming";
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
      <SheetTrigger render={<Button variant="ghost" size="icon" className="-ml-2 text-ink hover:bg-surface hover:text-brand-900 lg:hidden" aria-label="Open the menu" />}>
        <Menu />
      </SheetTrigger>
      <SheetContent side="right" className="w-full max-w-sm overflow-y-auto bg-panel">
        <SheetHeader>
          <SheetTitle>Menu</SheetTitle>
        </SheetHeader>
        <nav className="grid gap-1 px-4 pb-6">
          {nav.categories.some((c) => isGamingCategory(c.slug)) && (
            <Link href="/gaming" onClick={close} className="mb-1 flex items-center gap-3 rounded-xl bg-[#0b0e14] px-3.5 py-3 text-[#2fcf7a]">
              <Gamepad2 className="size-5 shrink-0" />
              <span className="grid flex-1 leading-tight">
                <span className="text-base font-semibold">Gaming</span>
                <span className="text-xs text-white/60">Custom PCs, GTA VI ready builds, gear</span>
              </span>
              <ChevronRight className="size-4" />
            </Link>
          )}
          <Accordion>
            {group("industries", "Industries", nav.industries, "/industries")}
            {group("products", "Products", nav.categories.filter((c) => !isGamingCategory(c.slug)), "/products")}
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
          <Link href="/guides" onClick={close} className="py-3 text-base font-semibold">
            Guides
          </Link>
          <Link href="/blog" onClick={close} className="py-3 text-base font-semibold">
            Blog
          </Link>
          <Link href="/about" onClick={close} className="py-3 text-base font-semibold">
            About
          </Link>
          <Link href="/contact" onClick={close} className="py-3 text-base font-semibold">
            Contact
          </Link>
          <span onClick={close} className="mt-4">
            <Action href="/quote" size="lg" className="w-full justify-between" track="mobile-nav">
              {ctaLabel}
            </Action>
          </span>
          {/* phones have no footer: its small links live here */}
          <p className="mt-6 flex flex-wrap gap-x-4 gap-y-2 border-t border-line pt-4 text-xs text-muted-ink">
            <Link href="/delivery-warranty" onClick={close} className="hover:text-brand-900">
              Delivery and warranty
            </Link>
            <Link href="/privacy" onClick={close} className="hover:text-brand-900">
              Privacy
            </Link>
            <Link href="/terms" onClick={close} className="hover:text-brand-900">
              Terms
            </Link>
          </p>
        </nav>
      </SheetContent>
    </Sheet>
  );
}
