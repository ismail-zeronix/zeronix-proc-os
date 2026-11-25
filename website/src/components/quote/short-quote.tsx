"use client";

import { ArrowRight, CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { gaEvent } from "@/lib/ga";
import { firstTouch, sessionUtm } from "@/lib/track";

const input = "h-11 w-full rounded-lg border border-line bg-panel px-3.5 text-sm outline-none transition-colors placeholder:text-muted-ink/60 focus:border-brand-700";

/**
 * The short quote form on category and landing pages (SEO audit task 3): name, company, email, phone and what they
 * need, sent through the same /api/quote as the full form, so it lands in Website › Leads with the page and campaign.
 */
export function ShortQuote({ title, text, cta, topic, placeholder }: { title: string; text: string; cta: string; topic: string; placeholder: string }) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const get = (k: string) => String(f.get(k) ?? "").trim();
    const first = firstTouch();
    const now = sessionUtm();
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
        users: null,
        budget: "",
        timeline: "",
        notes: [`Asked about: ${topic}`, get("notes")].filter(Boolean).join("\n"),
        industry: "",
        items: [],
        sourcePage: location.pathname,
        cta,
        utm: Object.keys(now).length ? now : (first?.utm ?? {}),
        landingPath: first?.path ?? "",
        firstReferrer: first?.ref ?? "",
        visitorKey: "",
        newsletter: f.get("newsletter") === "on",
        website: get("website"),
      }),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setSending(false);
    if (!res?.ok) return setError(data.error ?? "Something went wrong. Please try again, or chat with us.");
    gaEvent("generate_lead", { form_name: "short_quote", product: topic });
    setDone(true);
  };

  return (
    <section className="container-site py-4 sm:py-8">
      <div className="grid gap-4 rounded-card border border-line/70 bg-panel p-4 sm:p-6 lg:grid-cols-[1fr_1.4fr] lg:gap-8">
        <div className="grid content-start gap-1.5">
          <h2 className="text-h2">{title}</h2>
          <p className="text-sm text-muted-ink">{text}</p>
        </div>
        {done ? (
          <div className="flex items-start gap-3 rounded-lg bg-surface-soft p-4 text-sm">
            <CheckCircle2 className="size-5 shrink-0 text-brand-700" />
            <p>Thank you, we have your request. Our team replies with pricing, usually within a working day.</p>
          </div>
        ) : (
          <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
            <input name="name" required minLength={2} autoComplete="name" placeholder="Name" aria-label="Name" className={input} />
            <input name="company" autoComplete="organization" placeholder="Company" aria-label="Company" className={input} />
            <input name="email" type="email" required autoComplete="email" placeholder="Work email" aria-label="Work email" className={input} />
            <input name="phone" type="tel" autoComplete="tel" placeholder="Phone or WhatsApp" aria-label="Phone or WhatsApp" className={input} />
            <textarea name="notes" rows={3} maxLength={3000} placeholder={placeholder} aria-label="What you need" className={`${input} h-auto py-3 sm:col-span-2`} />
            <label className="flex items-start gap-3 text-sm sm:col-span-2">
              <input name="newsletter" type="checkbox" className="mt-0.5 size-4 shrink-0 accent-brand-700" />
              <span>
                Send me Zeronix&apos;s weekly product news and offers. <span className="text-muted-ink">Unsubscribe anytime.</span>
              </span>
            </label>
            {/* bots fill this in; people never see it */}
            <input name="website" tabIndex={-1} autoComplete="off" aria-hidden className="absolute -left-[9999px] h-0 w-0 opacity-0" />
            {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800 sm:col-span-2">{error}</p>}
            <div className="sm:col-span-2">
              <button type="submit" disabled={sending} className="group inline-flex h-12 items-center gap-3 rounded-full bg-cta pr-1.5 pl-6 font-semibold text-on-brand transition-colors hover:bg-cta-strong disabled:opacity-60">
                {sending ? "Sending…" : cta}
                <span className="grid size-9 place-items-center rounded-full bg-brand-900 text-on-brand">
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              </button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
