import { Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import Link from "next/link";
import type { SiteBrand, SiteIconLink, SiteNavResponse } from "@/lib/contract";
import { Logo } from "@/components/brand/logo";
import { KeywordHub, type EmirateKeywords } from "@/components/home/keyword-hub";
import { profileLinks } from "@/lib/seo";
import { SocialLinks } from "./social-links";

const EMIRATES = ["Dubai", "Abu Dhabi", "Sharjah", "Ajman", "Ras Al Khaimah", "Fujairah", "Umm Al Quwain"];

function Column({ title, links }: { title: string; links: { href: string; label: string }[] }) {
  if (!links.length) return null;
  return (
    <div>
      <h3 className="flex items-center gap-2 text-xs font-semibold tracking-[0.12em] text-mint-300 uppercase">{title}</h3>
      <ul className="mt-3 grid gap-2">
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="text-sm text-white/65 transition-colors hover:text-lime-400">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

const contact = "inline-flex h-10 items-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-4 text-sm text-white/85 transition-colors hover:border-lime-400 hover:bg-lime-400 hover:text-forest-950";

/** Searches per emirate (home page only, see KeywordHub): every link goes to a real category or service page. */
function emirateKeywords(nav: SiteNavResponse, services: SiteIconLink[]): EmirateKeywords[] {
  return EMIRATES.map((e) => ({
    emirate: e,
    products: [
      ...nav.categories.map((c) => ({ href: `/products/${c.slug}`, label: `${c.name} in ${e}` })),
      { href: "/products", label: `IT hardware supplier in ${e}` },
      { href: "/quote", label: `Bulk IT orders in ${e}` },
    ],
    services: [...services.map((s) => ({ href: s.href, label: `${s.label} in ${e}` })), { href: "/services", label: `IT company in ${e}` }],
  }));
}

/**
 * Full-width forest footer: brand and contact row, link columns, then either popular searches by emirate (home) or the
 * emirates we deliver to (other pages), the legal line, and a large faded wordmark.
 */
export function Footer({ brand, nav, services }: { brand: SiteBrand; nav: SiteNavResponse; services: SiteIconLink[] }) {
  const wa = brand.whatsapp.replace(/\D/g, "");
  return (
    <footer className="relative mt-2 overflow-hidden bg-forest-950 text-white sm:rounded-t-[2rem]">
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

        <KeywordHub groups={emirateKeywords(nav, services)}>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-white/10 py-5 text-xs text-white/55">
            Delivery and on-site service in
            {EMIRATES.map((e, i) => (
              <span key={e} className="text-white/75">
                {e}
                {i < EMIRATES.length - 1 ? "," : ""}
              </span>
            ))}
          </p>
        </KeywordHub>

        <div className="flex flex-col gap-3 border-t border-white/10 py-5 lg:flex-row lg:items-center lg:justify-between">
          <p className="flex items-center gap-2 text-xs text-white/55">
            <MapPin className="size-3.5 text-lime-400" />
            {brand.address || "United Arab Emirates"}
          </p>
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
