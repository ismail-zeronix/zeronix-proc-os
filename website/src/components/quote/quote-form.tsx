"use client";

import { ArrowRight, CheckCircle2, MessageCircle, Minus, Plus, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { SiteBrand } from "@/lib/contract";
import { quoteList, useQuoteList } from "@/lib/quote-list";
import { firstTouch, sessionUtm } from "@/lib/track";
import { ChatNowButton } from "./chat-now";

const input = "h-12 w-full rounded-2xl border border-line bg-white px-4 text-base outline-none transition-colors placeholder:text-muted-ink/60 focus:border-forest-700";
const label = "grid gap-2 text-sm font-medium";

/** The quote form: the quote list (with quantities), then who is asking and what for. Sends to the site's /api/quote. */
export function QuoteForm({
  brand,
  industries,
  prefill,
}: {
  brand: SiteBrand;
  industries: { slug: string; name: string }[];
  prefill: { industry: string; product: { slug: string; name: string } | null; category: string };
}) {
  const items = useQuoteList();
  const added = useRef(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  // the product whose "Get B2B price" opened this page joins the list once
  useEffect(() => {
    if (added.current || !prefill.product) return;
    added.current = true;
    if (!items.some((i) => i.slug === prefill.product!.slug)) quoteList.add(prefill.product);
  }, [items, prefill.product]);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const get = (k: string) => String(f.get(k) ?? "").trim();
    // what brought this visitor in (their first visit), so the lead shows the guide and the search behind it
    const first = firstTouch();
    const now = sessionUtm();
    const utm = Object.keys(now).length ? now : (first?.utm ?? {});
    const from = document.referrer.startsWith(location.origin) ? new URL(document.referrer).pathname : document.referrer;
    setSending(true);
    setError("");
    const res = await fetch("/api/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: get("name"),
        company: get("company"),
        email: get("email"),
        phone: get("phone"),
        users: Number(get("users")) || null,
        budget: get("budget"),
        timeline: get("timeline"),
        notes: [prefill.category && !items.length ? `Interested in: ${prefill.category}` : "", get("notes")].filter(Boolean).join("\n"),
        industry: get("industry"),
        items: items.map((i) => ({ slug: i.slug, name: i.name, qty: i.qty })),
        sourcePage: from.slice(0, 500),
        cta: brand.ctaLabel,
        utm,
        landingPath: first?.path ?? "",
        firstReferrer: first?.ref ?? "",
        visitorKey: "",
        website: get("website"),
      }),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setSending(false);
    if (!res?.ok) return setError(data.error ?? "Something went wrong. Please try again, or chat with us.");
    quoteList.clear();
    setDone(true);
    window.dispatchEvent(new CustomEvent("zx:quote-sent"));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (done)
    return (
      <div className="grid justify-items-start gap-5 rounded-card bg-white p-8">
        <CheckCircle2 className="size-10 text-forest-700" />
        <h2 className="text-2xl font-medium">Thank you, we have your request.</h2>
        <p className="max-w-xl text-muted-ink">Our sales team will reply with B2B pricing, usually within a working day. If it is urgent, chat with us now.</p>
        <div className="flex flex-wrap gap-3">
          <ChatNowButton message="Hi, I just sent a B2B pricing request and would like to talk to sales." context={{ industry: prefill.industry, cta: "After quote form" }} />
          <Link href="/" className="inline-flex h-11 items-center rounded-full border border-line px-5 text-sm font-semibold hover:border-forest-700/40">
            Back to the home page
          </Link>
        </div>
      </div>
    );

  return (
    <form onSubmit={submit} className="grid gap-6">
      <section className="grid gap-3 rounded-card bg-white p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">Models</h2>
          <Link href="/products" className="text-sm text-forest-700 hover:underline">
            Add more from the catalog
          </Link>
        </div>
        {items.length ? (
          <ul className="grid gap-2">
            {items.map((i) => (
              <li key={i.slug} className="flex items-center gap-3 rounded-2xl bg-sage-50 p-2 pl-4">
                <span className="min-w-0 flex-1 truncate font-medium">{i.name}</span>
                <div className="flex items-center rounded-full border border-line bg-white">
                  <button type="button" aria-label={`One less ${i.name}`} className="grid size-9 place-items-center" onClick={() => quoteList.setQty(i.slug, i.qty - 1)}>
                    <Minus className="size-3.5" />
                  </button>
                  <input aria-label={`How many ${i.name}`} inputMode="numeric" className="w-12 bg-transparent text-center tabular-nums outline-none" value={i.qty} onChange={(e) => quoteList.setQty(i.slug, Number(e.target.value))} />
                  <button type="button" aria-label={`One more ${i.name}`} className="grid size-9 place-items-center" onClick={() => quoteList.setQty(i.slug, i.qty + 1)}>
                    <Plus className="size-3.5" />
                  </button>
                </div>
                <button type="button" aria-label={`Remove ${i.name}`} className="grid size-9 place-items-center rounded-full text-muted-ink hover:text-ink" onClick={() => quoteList.remove(i.slug)}>
                  <X className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-ink">Not sure which models yet? Leave this empty and tell us below what your team does{prefill.category ? ` (we noted ${prefill.category.toLowerCase()})` : ""}.</p>
        )}
      </section>

      <section className="grid gap-4 rounded-card bg-white p-6 sm:grid-cols-2">
        <h2 className="text-lg font-semibold sm:col-span-2">Your details</h2>
        <label className={label}>
          Name
          <input name="name" required minLength={2} autoComplete="name" className={input} />
        </label>
        <label className={label}>
          Company
          <input name="company" autoComplete="organization" className={input} />
        </label>
        <label className={label}>
          Work email
          <input name="email" type="email" required autoComplete="email" className={input} />
        </label>
        <label className={label}>
          Phone or WhatsApp
          <input name="phone" type="tel" autoComplete="tel" placeholder="+971" className={input} />
        </label>
        <label className={label}>
          Industry
          <select name="industry" defaultValue={prefill.industry} className={input}>
            <option value="">Choose…</option>
            {industries.map((i) => (
              <option key={i.slug} value={i.slug}>
                {i.name}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          How many people will use them?
          <input name="users" type="number" min={1} max={100000} inputMode="numeric" className={input} />
        </label>
        <label className={label}>
          When do you need them?
          <select name="timeline" className={input} defaultValue="">
            <option value="">Choose…</option>
            <option>This week</option>
            <option>This month</option>
            <option>In 1 to 3 months</option>
            <option>Just comparing for now</option>
          </select>
        </label>
        <label className={label}>
          Budget (optional)
          <input name="budget" placeholder="e.g. AED 5,000 per laptop" className={input} />
        </label>
        <label className={`${label} sm:col-span-2`}>
          Anything else?
          <textarea name="notes" rows={4} maxLength={3000} placeholder="What the team does, software they run, where to deliver…" className={`${input} h-auto py-3`} />
        </label>
        {/* bots fill this in; people never see it */}
        <input name="website" tabIndex={-1} autoComplete="off" aria-hidden className="absolute -left-[9999px] h-0 w-0 opacity-0" />
      </section>

      {error && <p className="rounded-2xl bg-red-50 p-4 text-sm text-red-800">{error}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={sending} className="group inline-flex h-13 items-center gap-3 rounded-full bg-lime-400 pr-1.5 pl-6 font-semibold text-forest-950 transition-colors hover:bg-lime-500 disabled:opacity-60">
          {sending ? "Sending…" : "Send request"}
          <span className="grid size-10 place-items-center rounded-full bg-forest-950 text-lime-400">
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        </button>
        <span className="text-sm text-muted-ink">or</span>
        <ChatNowButton message={prefill.product ? `Hi, I'm looking for B2B pricing on the ${prefill.product.name}.` : "Hi, I'm looking for B2B pricing."} context={{ industry: prefill.industry, product: prefill.product?.slug ?? "", category: prefill.category, cta: "Quote page" }} />
        {brand.whatsapp && (
          <a href={`https://wa.me/${brand.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center gap-2 rounded-full border border-line px-4 text-sm font-semibold hover:border-forest-700/40">
            <MessageCircle className="size-4" /> WhatsApp
          </a>
        )}
      </div>
    </form>
  );
}
