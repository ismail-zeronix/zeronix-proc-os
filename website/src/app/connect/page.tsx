import type { Metadata } from "next";
import { Tag } from "@/components/brand/action";
import { QuoteForm } from "@/components/quote/quote-form";
import { getNav, getSettings } from "@/lib/api";
import { portalCall } from "@/lib/portal-call";

export const dynamic = "force-dynamic";

/** Reached from the link in our emails, often with a personal ?r=: never indexed, never cached. */
export const metadata: Metadata = {
  title: "Tell us what you need",
  description: "Send Zeronix Tech your IT requirement for B2B pricing, and choose whether to get our weekly product news.",
  robots: { index: false, follow: false },
  alternates: { canonical: "/contact" },
};

const one = (v: string | string[] | undefined) => String((Array.isArray(v) ? v[0] : v) ?? "").trim();

/**
 * The page every cold email links to (Phase 6 of the sales routine): the usual request form, pre-filled when the link
 * carries the signed ?r= of the company we wrote to, with the unticked weekly-news box. It lands in Website › Leads, and
 * the portal moves that company to Outreach › Replies.
 */
export default async function ConnectPage({ searchParams }: PageProps<"/connect">) {
  const ref = one((await searchParams).r).slice(0, 80);
  const [nav, { brand }, known] = await Promise.all([
    getNav(),
    getSettings(),
    ref ? portalCall(`/connect?r=${encodeURIComponent(ref)}`).then((r) => (r.status === 200 ? r.data : {})) : Promise.resolve<Record<string, unknown>>({}),
  ]);
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const who = { name: str(known.name), company: str(known.company), email: str(known.email), phone: str(known.phone) };
  return (
    <section className="container-site grid max-w-4xl gap-6 py-10 lg:py-8">
      <Tag>Zeronix Tech</Tag>
      <h1 className="text-h1">{who.company ? `Hello ${who.name.split(" ")[0] || who.company}, tell us what you need` : "Tell us what you need"}</h1>
      <p className="max-w-2xl text-lead text-muted-ink">
        Laptops, workstations, networking, CCTV or a full office setup: send us the details and our team replies with advice and B2B pricing, usually within a
        working day. Tick the box below if you also want our weekly product news.
      </p>
      <QuoteForm brand={brand} industries={nav.industries.map((i) => ({ slug: i.slug, name: i.name }))} prefill={{ industry: "", product: null, category: "" }} who={who} connectRef={ref} cta="Connect link" />
    </section>
  );
}
