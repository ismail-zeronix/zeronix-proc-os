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
} from "@/components/ui/navigation-menu";
import { Tag } from "@/components/brand/action";
import type { SiteIconLink, SiteNavLink, SiteNavResponse } from "@/lib/contract";
import { SiteIconView } from "@/lib/icons";

function Tile({ href, item }: { href: string; item: SiteNavLink }) {
  return (
    <NavigationMenuLink render={<Link href={href} />} className="items-start gap-3 rounded-2xl p-3 hover:bg-surface-soft focus:bg-surface-soft">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface text-brand-900">
        <SiteIconView name={item.icon} className="size-4" strokeWidth={1.75} />
      </span>
      <span className="grid gap-0.5">
        <span className="font-semibold text-ink">{item.name}</span>
        {item.summary && <span className="line-clamp-2 text-xs leading-snug text-muted-ink">{item.summary}</span>}
      </span>
    </NavigationMenuLink>
  );
}

/** The navy panel at the side of each menu: the one action every page pushes (BRAND.md section 6). */
function Promo({ title, text, href, cta }: { title: string; text: string; href: string; cta: string }) {
  return (
    <Link href={href} className="group flex flex-col justify-between rounded-2xl bg-brand-900 p-5 text-white">
      <div className="grid gap-2">
        <Tag onDark className="w-fit">B2B</Tag>
        <p className="mt-2 font-heading text-lg font-medium">{title}</p>
        <p className="text-sm leading-relaxed text-white/65">{text}</p>
      </div>
      <span className="mt-5 inline-flex h-10 items-center gap-2 self-start rounded-full bg-cta pr-1 pl-4 text-sm font-semibold text-brand-950">
        {cta}
        <span className="grid size-8 place-items-center rounded-full bg-brand-950 text-cta">
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
        </span>
      </span>
    </Link>
  );
}

/** Home page service tiles as menu items (their href is the address). */
const asNav = (s: SiteIconLink): SiteNavLink => ({ slug: s.href, name: s.label, icon: s.icon, summary: "" });

const RESOURCES = [
  { href: "/guides", label: "Buying guides", text: "What to buy for each role and industry" },
  { href: "/blog", label: "Blog", text: "News and advice on business IT in the UAE" },
  { href: "/about", label: "About us", text: "Who we are and how we work" },
  { href: "/contact", label: "Contact", text: "Phone, WhatsApp, email and address" },
];

export function MegaMenu({ nav, services, ctaLabel }: { nav: SiteNavResponse; services: SiteIconLink[]; ctaLabel: string }) {
  return (
    <NavigationMenu className="-ml-3 hidden lg:flex" align="start">
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
                  <NavigationMenuLink key={b.slug} render={<Link href={`/brands/${b.slug}`} />} className="justify-between rounded-2xl p-3 font-semibold hover:bg-surface-soft">
                    {b.name} <ArrowRight className="size-3.5 text-muted-foreground" />
                  </NavigationMenuLink>
                ))}
              </div>
            </NavigationMenuContent>
          </NavigationMenuItem>
        )}
        {services.length > 0 && (
          <NavigationMenuItem>
            <NavigationMenuTrigger>Services</NavigationMenuTrigger>
            <NavigationMenuContent className="w-[min(94vw,760px)] p-3">
              <div className="grid grid-cols-[1fr_14rem] gap-3">
                <div className="grid grid-cols-2 content-start gap-0.5">
                  {services.map((s) => (
                    <Tile key={s.href} href={s.href} item={asNav(s)} />
                  ))}
                </div>
                <Promo title="Setting up an office?" text="Network, devices, security and meeting rooms, planned and installed by one team." href="/quote?topic=office" cta={ctaLabel} />
              </div>
            </NavigationMenuContent>
          </NavigationMenuItem>
        )}
        <NavigationMenuItem>
          <NavigationMenuTrigger>Resources</NavigationMenuTrigger>
          <NavigationMenuContent className="w-[min(94vw,420px)] p-3">
            <div className="grid gap-0.5">
              {RESOURCES.map((r) => (
                <NavigationMenuLink key={r.href} render={<Link href={r.href} />} className="grid gap-0.5 rounded-2xl p-3 hover:bg-surface-soft">
                  <span className="font-semibold text-ink">{r.label}</span>
                  <span className="text-xs text-muted-ink">{r.text}</span>
                </NavigationMenuLink>
              ))}
            </div>
          </NavigationMenuContent>
        </NavigationMenuItem>
      </NavigationMenuList>
    </NavigationMenu>
  );
}
