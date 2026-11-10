"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { cart, cartTotal, useCart } from "@/lib/cart";
import { deliveryFee, toFreeDelivery, useStoreInfo, type Payment } from "@/lib/store-info";
import { cn } from "@/lib/utils";
import { CartView } from "./cart-view";
import { aed, Field, FreeDeliveryBar, input, priceText, Totals, TrustNotes } from "./fields";


const EMIRATES = ["Dubai", "Abu Dhabi", "Sharjah", "Ajman", "Umm Al Quwain", "Ras Al Khaimah", "Fujairah"];
const PAY_LABEL: Record<Payment, { title: string; text: string }> = {
  request: { title: "Order request", text: "We confirm your order and send a payment link or invoice." },
  cod: { title: "Cash or card on delivery", text: "Pay the driver when your order arrives." },
  bank: { title: "Bank transfer", text: "Bank details are shown after you order." },
};

/** One-page checkout: contact, company and TRN, delivery or collection, how to pay. Signed-in customers start filled in. */
export function CheckoutForm() {
  const router = useRouter();
  const items = useCart();
  const store = useStoreInfo();
  const [signedIn, setSignedIn] = useState<string | null>(null);
  const [f, setF] = useState({ name: "", email: "", phone: "", company: "", trn: "", delivery: "delivery" as "delivery" | "pickup", emirate: "Dubai", area: "", street: "", payment: "request" as Payment, notes: "", website: "" });
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const patch = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));

  useEffect(() => {
    fetch("/api/account")
      .then((r) => (r.ok ? r.json() : null))
      .then((a) => {
        const c = a?.customer;
        if (!c) return;
        setSignedIn(c.email);
        setF((x) => ({ ...x, name: x.name || c.name, email: c.email, phone: x.phone || c.phone, company: x.company || c.company, trn: x.trn || c.trn, emirate: c.address?.emirate || x.emirate, area: x.area || c.address?.area || "", street: x.street || c.address?.street || "" }));
      })
      .catch(() => {});
  }, []);

  if (!items.length) return <CartView />;
  const total = cartTotal(items);
  // a way to pay the store no longer offers falls back to the first one it does
  const payment: Payment = store && !store.payments.includes(f.payment) ? (store.payments[0] ?? "request") : f.payment;
  const rules = store?.delivery;
  const fee = deliveryFee(rules, total, f.delivery, f.emirate);
  const left = f.delivery === "delivery" ? toFreeDelivery(rules, total) : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSending(true);
    const res = await fetch("/api/order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: items.map((i) => ({ slug: i.slug, qty: i.qty })),
        name: f.name,
        email: f.email,
        phone: f.phone,
        company: f.company,
        trn: f.trn,
        delivery: f.delivery,
        address: f.delivery === "delivery" ? { emirate: f.emirate, area: f.area, street: f.street } : { emirate: "", area: "", street: "" },
        payment,
        notes: f.notes,
        website: f.website,
      }),
    }).catch(() => null);
    const data = await res?.json().catch(() => ({}));
    setSending(false);
    if (!res?.ok) return setError(data?.error ?? "We could not place the order. Please try again or call us.");
    cart.clear();
    router.push(`/checkout/done?n=${encodeURIComponent(data.number)}&pay=${data.payment}&total=${data.total}`);
  };

  return (
    <form onSubmit={submit} className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="grid gap-4">
        <section className="grid gap-3 rounded-card border border-line/70 bg-white p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-semibold text-ink">Your details</h2>
            {signedIn ? (
              <span className="text-xs text-muted-ink">Signed in as {signedIn}</span>
            ) : store?.signIn ? (
              <Link href="/account?next=/checkout" className="text-xs font-semibold text-brand-800 hover:text-brand-950">
                Have an account? Sign in
              </Link>
            ) : null}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Full name">
              <input required minLength={2} autoComplete="name" className={input} value={f.name} onChange={(e) => patch({ name: e.target.value })} />
            </Field>
            <Field label="Mobile">
              <input required type="tel" autoComplete="tel" placeholder="+971 5…" className={input} value={f.phone} onChange={(e) => patch({ phone: e.target.value })} />
            </Field>
            <Field label="Email" className="sm:col-span-2">
              <input required type="email" autoComplete="email" className={input} value={f.email} disabled={Boolean(signedIn)} onChange={(e) => patch({ email: e.target.value })} />
            </Field>
            <Field label="Company (optional)">
              <input autoComplete="organization" className={input} value={f.company} onChange={(e) => patch({ company: e.target.value })} />
            </Field>
            <Field label="TRN (optional)" hint="For a tax invoice in your company's name">
              <input inputMode="numeric" className={input} value={f.trn} onChange={(e) => patch({ trn: e.target.value })} />
            </Field>
          </div>
        </section>

        <section className="grid gap-3 rounded-card border border-line/70 bg-white p-4">
          <h2 className="text-base font-semibold text-ink">Delivery</h2>
          <div className="grid grid-cols-2 gap-2">
            {(["delivery", "pickup"] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => patch({ delivery: d })}
                className={cn("rounded-xl border px-3 py-2.5 text-left text-sm", f.delivery === d ? "border-brand-900 bg-surface-soft font-semibold text-ink" : "border-line text-muted-ink hover:border-brand-700")}
              >
                <span className="block">{d === "delivery" ? "Deliver to me" : "Collect from our office"}</span>
                <span className="text-xs font-normal text-muted-ink">{d === "pickup" || !rules ? "Free" : deliveryFee(rules, total, "delivery", f.emirate) ? aed(deliveryFee(rules, total, "delivery", f.emirate)) : "Free"}</span>
              </button>
            ))}
          </div>
          {f.delivery === "delivery" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Emirate">
                <select className={input} value={f.emirate} onChange={(e) => patch({ emirate: e.target.value })}>
                  {EMIRATES.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </Field>
              <Field label="Area">
                <input required placeholder="Business Bay" className={input} value={f.area} onChange={(e) => patch({ area: e.target.value })} />
              </Field>
              <Field label="Building, street, office or villa" className="sm:col-span-2">
                <input required autoComplete="street-address" className={input} value={f.street} onChange={(e) => patch({ street: e.target.value })} />
              </Field>
            </div>
          ) : (
            <p className="text-sm text-muted-ink">We will call you when your order is ready to collect.</p>
          )}
          {store?.deliveryNote && <p className="text-xs text-muted-ink">{store.deliveryNote}</p>}
        </section>

        <section className="grid gap-3 rounded-card border border-line/70 bg-white p-4">
          <h2 className="text-base font-semibold text-ink">Payment</h2>
          <div className="grid gap-2">
            {(store?.payments ?? ["request"]).map((p) => (
              <label key={p} className={cn("flex cursor-pointer gap-3 rounded-xl border px-3 py-2.5 text-sm", payment === p ? "border-brand-900 bg-surface-soft" : "border-line hover:border-brand-700")}>
                <input type="radio" name="payment" className="mt-1 accent-brand-900" checked={payment === p} onChange={() => patch({ payment: p })} />
                <span>
                  <span className="block font-semibold text-ink">{PAY_LABEL[p].title}</span>
                  <span className="text-xs text-muted-ink">{PAY_LABEL[p].text}</span>
                </span>
              </label>
            ))}
          </div>
          <Field label="Notes (optional)">
            <textarea rows={2} maxLength={1000} className={`${input} h-auto py-2.5`} value={f.notes} onChange={(e) => patch({ notes: e.target.value })} placeholder="Delivery times, a PO number…" />
          </Field>
          <input name="website" tabIndex={-1} autoComplete="off" aria-hidden className="absolute -left-[9999px] h-0 w-0 opacity-0" value={f.website} onChange={(e) => patch({ website: e.target.value })} />
        </section>
      </div>

      <aside className="grid gap-3 rounded-card border border-line/70 bg-white p-4 lg:sticky lg:top-32">
        <h2 className="text-base font-semibold text-ink">Your order</h2>
        <ul className="grid gap-2">
          {items.map((i) => (
            <li key={i.slug} className="grid grid-cols-[3rem_minmax(0,1fr)_auto] items-center gap-2 text-sm">
              <span className="relative size-12 overflow-hidden rounded-inner border border-line/60 bg-white">{i.image && <Image src={i.image} alt="" fill sizes="48px" className="object-contain p-0.5" />}</span>
              <span className="line-clamp-2 leading-snug">
                <span className="font-semibold tabular-nums">{i.qty} ×</span> {i.name}
              </span>
              <span className="tabular-nums">{priceText((Number(i.price) * i.qty).toFixed(2))}</span>
            </li>
          ))}
        </ul>
        {left !== null && rules && <FreeDeliveryBar left={left} threshold={rules.freeAbove} />}
        <Totals goods={total} delivery={f.delivery === "pickup" ? "pickup" : rules ? fee : undefined} />
        {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
        <button type="submit" disabled={sending} className="inline-flex h-12 items-center justify-center rounded-full bg-cta px-6 text-base font-semibold text-brand-950 transition-colors hover:bg-cta-strong disabled:opacity-60">
          {sending ? "Placing your order…" : "Place order"}
        </button>
        <Link href="/cart" className="text-center text-xs font-semibold text-brand-800 hover:text-brand-950">
          Edit cart
        </Link>
        <TrustNotes />
      </aside>
    </form>
  );
}
