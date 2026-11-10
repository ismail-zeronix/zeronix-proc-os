import { Clock, Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import type { Metadata } from "next";
import { Tag } from "@/components/brand/action";
import { Breadcrumbs, JsonLd } from "@/components/catalog/page-parts";
import { QuoteForm } from "@/components/quote/quote-form";
import { getNav, getSettings } from "@/lib/api";
import { SITE_URL } from "@/lib/defaults";
import { readableHours } from "@/lib/seo";

export const revalidate = 600;

export const metadata: Metadata = {
  title: "Contact us",
  description: "Call, WhatsApp or email the Zeronix Tech sales team, or send us your requirement. Business IT for UAE companies with B2B pricing and VAT invoices.",
  alternates: { canonical: "/contact" },
};

/** Contact details from Website › Settings (brand), and the same request form as /quote (it lands in Website › Leads). */
export default async function ContactPage() {
  const [{ brand }, nav] = await Promise.all([getSettings(), getNav()]);
  const wa = brand.whatsapp.replace(/[^\d]/g, "");
  const lines = [
    brand.phone && { icon: Phone, label: "Call", value: brand.phone, href: `tel:${brand.phone.replace(/\s/g, "")}` },
    wa && { icon: MessageCircle, label: "WhatsApp", value: brand.whatsapp, href: `https://wa.me/${wa}` },
    brand.email && { icon: Mail, label: "Email", value: brand.email, href: `mailto:${brand.email}` },
    brand.address && { icon: MapPin, label: "Office", value: brand.address, href: brand.mapUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(brand.address)}` },
    brand.hours && { icon: Clock, label: "Opening hours", value: readableHours(brand.hours), href: brand.mapUrl || "/contact" },
  ].filter(Boolean) as { icon: typeof Phone; label: string; value: string; href: string }[];

  return (
    <section className="container-site grid gap-6 py-10 lg:grid-cols-[1fr_22rem] lg:py-8">
      <div className="grid content-start gap-6">
        <Breadcrumbs items={[{ href: "/contact", label: "Contact" }]} />
        <Tag>Contact</Tag>
        <h1 className="text-h2">Talk to our business sales team</h1>
        <p className="max-w-2xl text-lead text-muted-ink">Tell us what your team does and what you need. We reply with advice and B2B pricing, usually within a working day.</p>
        <QuoteForm brand={brand} industries={nav.industries.map((i) => ({ slug: i.slug, name: i.name }))} prefill={{ industry: "", product: null, category: "" }} />
      </div>
      <aside className="grid content-start gap-3">
        {lines.map((l) => (
          <a key={l.label} href={l.href} target={l.href.startsWith("http") ? "_blank" : undefined} rel="noreferrer" className="flex items-start gap-3 rounded-card bg-white p-5 transition-colors hover:bg-surface-soft">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-900 text-cta">
              <l.icon className="size-4" />
            </span>
            <span className="grid gap-0.5">
              <span className="text-sm text-muted-ink">{l.label}</span>
              <span className="font-semibold text-ink">{l.value}</span>
            </span>
          </a>
        ))}
        <p className="px-1 text-sm text-muted-ink">Delivery across the Emirates, with a UAE VAT invoice.</p>
      </aside>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "ContactPage",
          url: `${SITE_URL}/contact`,
          mainEntity: { "@type": "Organization", name: brand.name, url: SITE_URL, email: brand.email || undefined, telephone: brand.phone || undefined, address: brand.address || undefined },
        }}
      />
    </section>
  );
}
