import { Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import Link from "next/link";
import type { SiteBrand, SiteIconLink, SiteNavResponse } from "@/lib/contract";
import { Logo } from "@/components/brand/logo";

function Column({ title, links }: { title: string; links: { href: string; label: string }[] }) {
  if (!links.length) return null;
  return (
    <div>
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      <ul className="mt-2.5 grid gap-1.5">
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="text-sm text-white/60 transition-colors hover:text-white">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Footer({ brand, nav, services }: { brand: SiteBrand; nav: SiteNavResponse; services: SiteIconLink[] }) {
  const wa = brand.whatsapp.replace(/\D/g, "");
  return (
    <footer className="frame mt-2 mb-3 bg-forest-950 text-white sm:mb-4">
      <div className="container-site grid grid-cols-2 gap-x-6 gap-y-7 py-8 sm:py-10 lg:grid-cols-[1.4fr_1fr_1fr_1fr_1fr]">
        <div className="col-span-2 grid content-start gap-3 lg:col-span-1">
          <Logo onDark />
          <p className="max-w-xs text-sm leading-relaxed text-white/60">{brand.tagline} {brand.subline}</p>
          <ul className="grid gap-2 text-sm text-white/70">
            {brand.phone && (
              <li>
                <a href={`tel:${brand.phone.replace(/\s/g, "")}`} className="inline-flex items-center gap-2 hover:text-white">
                  <Phone className="size-4" /> {brand.phone}
                </a>
              </li>
            )}
            {wa && (
              <li>
                <a href={`https://wa.me/${wa}`} className="inline-flex items-center gap-2 hover:text-white" target="_blank" rel="noreferrer">
                  <MessageCircle className="size-4" /> WhatsApp
                </a>
              </li>
            )}
            {brand.email && (
              <li>
                <a href={`mailto:${brand.email}`} className="inline-flex items-center gap-2 hover:text-white">
                  <Mail className="size-4" /> {brand.email}
                </a>
              </li>
            )}
            {brand.address && (
              <li className="inline-flex items-center gap-2">
                <MapPin className="size-4" /> {brand.address}
              </li>
            )}
          </ul>
        </div>
        <Column title="Industries" links={nav.industries.slice(0, 7).map((i) => ({ href: `/industries/${i.slug}`, label: i.name }))} />
        <Column title="Products" links={nav.categories.map((c) => ({ href: `/products/${c.slug}`, label: c.name }))} />
        <Column
          title="Services"
          links={services.map((x) => ({ href: x.href, label: x.label }))}
        />
        <Column
          title="Company"
          links={[
            { href: "/about", label: "About us" },
            { href: "/guides", label: "Buying guides" },
            { href: "/blog", label: "Blog" },
            { href: "/quote", label: brand.ctaLabel },
            { href: "/contact", label: "Contact" },
            { href: "/privacy", label: "Privacy" },
            { href: "/terms", label: "Terms" },
            { href: "/delivery-warranty", label: "Delivery and warranty" },
          ]}
        />
      </div>
      <div className="border-t border-white/10">
        <div className="container-site flex flex-wrap items-center justify-between gap-2 py-4 text-xs text-white/50">
          <span>
            © {new Date().getFullYear()} {brand.name}. All rights reserved.
          </span>
          <span>Corporate pricing on request · VAT invoices · Delivery across the UAE</span>
        </div>
      </div>
    </footer>
  );
}
