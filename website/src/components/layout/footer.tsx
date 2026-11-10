import { Clock, Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import Link from "next/link";
import type { SiteBrand, SiteIconLink, SiteNavResponse } from "@/lib/contract";
import { Logo } from "@/components/brand/logo";
import { profileLinks, readableHours } from "@/lib/seo";
import { SocialLinks } from "./social-links";

const EMIRATES = ["Dubai", "Abu Dhabi", "Sharjah", "Ajman", "Ras Al Khaimah", "Fujairah", "Umm Al Quwain"];

function Column({ title, links }: { title: string; links: { href: string; label: string }[] }) {
  if (!links.length) return null;
  return (
    <div>
      <h3 className="flex items-center gap-2 text-xs font-semibold tracking-[0.12em] text-highlight uppercase">{title}</h3>
      <ul className="mt-3 grid gap-2">
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="text-sm text-white/65 transition-colors hover:text-cta">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

const contact = "inline-flex h-10 items-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-4 text-sm text-white/85 transition-colors hover:border-cta hover:bg-cta hover:text-brand-950";

/**
 * Full-width navy footer: brand and contact row, link columns, the emirates we deliver to, then the address, hours and
 * legal line (the same name, address and phone as schema.org and the Google Business Profile), and a faded wordmark.
 * No "Laptops in Dubai / in Sharjah…" link lists: links that all lead to the same pages read as doorway text to Google
 * (website/SEO-STRATEGY.md).
 */
export function Footer({ brand, nav, services }: { brand: SiteBrand; nav: SiteNavResponse; services: SiteIconLink[] }) {
  const wa = brand.whatsapp.replace(/\D/g, "");
  return (
    <footer className="relative mt-2 overflow-hidden bg-brand-950 text-white sm:rounded-t-[2rem]">
      <div className="relative container-site">
        <div className="flex flex-col gap-5 border-b border-white/10 py-8 sm:py-10 lg:flex-row lg:items-center lg:justify-between">
          <div className="grid max-w-md gap-3">
            <Logo onDark />
            <p className="text-sm leading-relaxed text-white/60">
              {brand.tagline} {brand.subline}
            </p>
            <SocialLinks profiles={profileLinks(brand)} brandName={brand.name} />
          </div>
          <ul className="flex flex-wrap gap-2">
            {brand.phone && (
              <li>
                <a href={`tel:${brand.phone.replace(/\s/g, "")}`} className={contact}>
                  <Phone className="size-4" /> {brand.phone}
                </a>
              </li>
            )}
            {wa && (
              <li>
                <a href={`https://wa.me/${wa}`} className={contact} target="_blank" rel="noreferrer">
                  <MessageCircle className="size-4" /> WhatsApp
                </a>
              </li>
            )}
            {brand.email && (
              <li>
                <a href={`mailto:${brand.email}`} className={contact}>
                  <Mail className="size-4" /> {brand.email}
                </a>
              </li>
            )}
          </ul>
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-8 py-8 sm:py-10 lg:grid-cols-4">
          <Column title="Products" links={nav.categories.map((c) => ({ href: `/products/${c.slug}`, label: c.name }))} />
          <Column title="Services" links={services.map((x) => ({ href: x.href, label: x.label }))} />
          <Column title="Industries" links={nav.industries.slice(0, 7).map((i) => ({ href: `/industries/${i.slug}`, label: i.name }))} />
          <Column
            title="Company"
            links={[
              { href: "/about", label: "About us" },
              { href: "/guides", label: "Buying guides" },
              { href: "/blog", label: "Blog" },
              { href: "/quote", label: brand.ctaLabel },
              { href: "/contact", label: "Contact" },
              { href: "/delivery-warranty", label: "Delivery and warranty" },
            ]}
          />
        </div>

        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-white/10 py-5 text-xs text-white/55">
          Delivery and on-site service in
          {EMIRATES.map((e, i) => (
            <span key={e} className="text-white/75">
              {e}
              {i < EMIRATES.length - 1 ? "," : ""}
            </span>
          ))}
        </p>

        <div className="flex flex-col gap-3 border-t border-white/10 py-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-white/55">
            {brand.mapUrl ? (
              <a href={brand.mapUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 hover:text-white">
                <MapPin className="size-3.5 text-cta" />
                {brand.address || "United Arab Emirates"}
              </a>
            ) : (
              <p className="flex items-center gap-2">
                <MapPin className="size-3.5 text-cta" />
                {brand.address || "United Arab Emirates"}
              </p>
            )}
            {brand.hours && (
              <p className="flex items-center gap-2">
                <Clock className="size-3.5 text-cta" />
                {readableHours(brand.hours)}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-white/50">
            <span>
              © {new Date().getFullYear()} {brand.name}
            </span>
            <Link href="/privacy" className="hover:text-white">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-white">
              Terms
            </Link>
            <span>VAT invoices · Corporate pricing</span>
          </div>
        </div>
      </div>

      <p aria-hidden className="relative -mb-[0.18em] text-center font-heading text-[13vw] leading-none font-semibold tracking-tighter whitespace-nowrap text-white/[0.04] select-none xl:text-[11rem]">
        {brand.name}
      </p>
    </footer>
  );
}
