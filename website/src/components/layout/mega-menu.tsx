"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu";
import { Tag } from "@/components/brand/action";
import type { SiteNavLink, SiteNavResponse } from "@/lib/contract";
import { SiteIconView } from "@/lib/icons";

function Tile({ href, item }: { href: string; item: SiteNavLink }) {
  return (
    <NavigationMenuLink render={<Link href={href} />} className="items-start gap-3 rounded-2xl p-3 hover:bg-sage-50 focus:bg-sage-50">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-sage-100 text-forest-900">
        <SiteIconView name={item.icon} className="size-4" strokeWidth={1.75} />
      </span>
      <span className="grid gap-0.5">
        <span className="font-semibold text-ink">{item.name}</span>
        {item.summary && <span className="line-clamp-2 text-xs leading-snug text-muted-ink">{item.summary}</span>}
      </span>
    </NavigationMenuLink>
  );
}

/** The forest panel at the side of each menu: the one action every page pushes (BRAND.md section 6). */
function Promo({ title, text, href, cta }: { title: string; text: string; href: string; cta: string }) {
  return (
    <Link href={href} className="group flex flex-col justify-between rounded-2xl bg-forest-900 p-5 text-white">
      <div className="grid gap-2">
        <Tag onDark className="w-fit">B2B</Tag>
        <p className="mt-2 font-heading text-lg font-medium">{title}</p>
        <p className="text-sm leading-relaxed text-white/65">{text}</p>
      </div>
      <span className="mt-5 inline-flex h-10 items-center gap-2 self-start rounded-full bg-lime-400 pr-1 pl-4 text-sm font-semibold text-forest-950">
        {cta}
        <span className="grid size-8 place-items-center rounded-full bg-forest-950 text-lime-400">
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
        </span>
      </span>
    </Link>
  );
}

export function MegaMenu({ nav, ctaLabel }: { nav: SiteNavResponse; ctaLabel: string }) {
  return (
    <NavigationMenu className="hidden lg:flex" align="center">
      <NavigationMenuList>
        {nav.industries.length > 0 && (
          <NavigationMenuItem>
            <NavigationMenuTrigger>Industries</NavigationMenuTrigger>
            <NavigationMenuContent className="w-[min(94vw,900px)] p-3">
              <div className="grid grid-cols-[1fr_15rem] gap-3">
                <div>
                  <p className="px-3 pt-1 pb-2 text-[0.6875rem] font-semibold tracking-[0.12em] text-muted-ink uppercase">IT by industry</p>
                  <div className="grid grid-cols-2 gap-0.5 xl:grid-cols-3">
                    {nav.industries.map((i) => (
                      <Tile key={i.slug} href={`/industries/${i.slug}`} item={i} />
                    ))}
                  </div>
                </div>
                <Promo title="Not sure what fits?" text="Tell us what your team does; we shortlist UAE models and send B2B pricing." href="/quote" cta={ctaLabel} />
              </div>
            </NavigationMenuContent>
          </NavigationMenuItem>
        )}
        {nav.categories.length > 0 && (
          <NavigationMenuItem>
            <NavigationMenuTrigger>Products</NavigationMenuTrigger>
            <NavigationMenuContent className="w-[min(94vw,720px)] p-3">
              <div className="grid grid-cols-[1fr_14rem] gap-3">
                <div className="grid grid-cols-2 content-start gap-0.5">
                  {nav.categories.map((c) => (
                    <Tile key={c.slug} href={`/products/${c.slug}`} item={c} />
                  ))}
                </div>
                <Promo title="Buying in volume?" text="Corporate pricing, VAT invoices and delivery across the Emirates." href="/quote" cta={ctaLabel} />
              </div>
            </NavigationMenuContent>
          </NavigationMenuItem>
        )}
        {nav.brands.length > 0 && (
          <NavigationMenuItem>
            <NavigationMenuTrigger>Brands</NavigationMenuTrigger>
            <NavigationMenuContent className="w-[min(94vw,420px)] p-3">
              <div className="grid grid-cols-2 gap-0.5">
                {nav.brands.map((b) => (
                  <NavigationMenuLink key={b.slug} render={<Link href={`/brands/${b.slug}`} />} className="justify-between rounded-2xl p-3 font-semibold hover:bg-sage-50">
                    {b.name} <ArrowRight className="size-3.5 text-muted-foreground" />
                  </NavigationMenuLink>
                ))}
              </div>
            </NavigationMenuContent>
          </NavigationMenuItem>
        )}
        <NavigationMenuItem>
          <NavigationMenuLink render={<Link href="/guides" />} className={navigationMenuTriggerStyle()}>
            Guides
          </NavigationMenuLink>
        </NavigationMenuItem>
        <NavigationMenuItem>
          <NavigationMenuLink render={<Link href="/about" />} className={navigationMenuTriggerStyle()}>
            About
          </NavigationMenuLink>
        </NavigationMenuItem>
      </NavigationMenuList>
    </NavigationMenu>
  );
}
