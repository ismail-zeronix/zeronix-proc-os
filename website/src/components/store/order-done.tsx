"use client";

import { CircleAlert, CircleCheck, LoaderCircle } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Action } from "@/components/brand/action";
import { aed } from "./fields";

type PayState = "checking" | "paid" | "pending" | "failed" | "closed" | "invalid";

const payment = (body: Record<string, string>) =>
  fetch("/api/order/payment", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    .then(async (r) => ({ ok: r.ok, data: (await r.json().catch(() => ({}))) as { state?: PayState; total?: string; payUrl?: string; error?: string } }))
    .catch(() => ({ ok: false, data: { error: "We could not reach the shop. Please check your connection." } as { state?: PayState; total?: string; payUrl?: string; error?: string } }));

/**
 * After checkout: the order number, what happens next, and the bank details when paying by transfer. For online
 * payment it asks the shop where the payment stands (the shop asks Nomod; coming back here proves nothing) and
 * offers to try again when it did not go through.
 */
export function OrderDone() {
  const sp = useSearchParams();
  const number = (sp.get("n") ?? "").slice(0, 20);
  const pay = sp.get("pay");
  const token = (sp.get("t") ?? "").slice(0, 64);
  const result = sp.get("r");
  const [total, setTotal] = useState(Number(sp.get("total") ?? 0));
  const [bank, setBank] = useState("");
  const [state, setState] = useState<PayState>(pay === "card" ? (token ? "checking" : "invalid") : "paid");
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (pay !== "bank") return;
    fetch("/api/store")
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => setBank(s?.bankDetails ?? ""))
      .catch(() => {});
  }, [pay]);

  useEffect(() => {
    if (pay !== "card" || !token) return;
    let stop = false;
    let tries = 0;
    const check = async () => {
      const { ok, data } = await payment({ action: "check", number, token });
      if (stop) return;
      if (!ok) return setState("invalid");
      if (data.total) setTotal(Number(data.total));
      const s = data.state ?? "pending";
      // Nomod may need a few seconds to settle after sending the customer back: keep asking for about half a minute
      if (s === "pending" && result === "success" && ++tries < 12) {
        setState("checking");
        setTimeout(check, 2500);
        return;
      }
      setState(s);
    };
    void check();
    return () => {
      stop = true;
    };
  }, [pay, number, token, result]);

  const retry = async () => {
    setError("");
    setRetrying(true);
    const { ok, data } = await payment({ action: "retry", number, token });
    if (ok && data.payUrl && /^https?:\/\//.test(data.payUrl)) return window.location.assign(data.payUrl);
    setRetrying(false);
    if (ok && data.state) return setState(data.state);
    setError(data.error ?? "The payment page could not be opened. Please try again or call us.");
  };

  if (pay === "card" && state !== "paid") {
    const busy = state === "checking";
    return (
      <div className="mx-auto grid w-full max-w-lg justify-items-center gap-4 rounded-card border border-line/70 bg-white p-6 text-center">
        {busy ? <LoaderCircle className="size-12 animate-spin text-brand-700" strokeWidth={1.5} /> : <CircleAlert className="size-12 text-amber-600" strokeWidth={1.5} />}
        <h1 className="text-2xl font-semibold text-ink">
          {busy ? "Checking your payment…" : state === "pending" ? "Payment not finished yet" : state === "closed" ? "This order was cancelled" : state === "invalid" ? "We could not find this payment" : "Payment did not go through"}
        </h1>
        {number && (
          <p className="text-sm text-muted-ink">
            Order <span className="font-semibold text-ink">{number}</span>
            {total > 0 && <> · {aed(total)}</>}
          </p>
        )}
        {!busy && state !== "closed" && state !== "invalid" && (
          <>
            <p className="text-sm text-ink">
              {result === "cancelled" ? "You left the payment page before paying." : "No money was taken."} Your order is saved: you can pay now, or call or chat with us and we will help.
            </p>
            <button
              type="button"
              onClick={retry}
              disabled={retrying}
              className="inline-flex h-12 items-center justify-center rounded-full bg-cta px-6 text-base font-semibold text-brand-950 transition-colors hover:bg-cta-strong disabled:opacity-60"
            >
              {retrying ? "Opening secure payment…" : "Try payment again"}
            </button>
          </>
        )}
        {state === "invalid" && <p className="text-sm text-ink">Please use the link from your checkout, or contact us with your order number.</p>}
        {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
        <div className="flex flex-wrap justify-center gap-2">
          <Action href="/contact" variant="outline" arrow={false}>
            Contact us
          </Action>
          <Action href="/account" variant="outline" arrow={false}>
            My orders
          </Action>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto grid w-full max-w-lg justify-items-center gap-4 rounded-card border border-line/70 bg-white p-6 text-center">
      <CircleCheck className="size-12 text-brand-700" strokeWidth={1.5} />
      <h1 className="text-2xl font-semibold text-ink">{pay === "card" ? "Payment received, thank you" : "Thank you for your order"}</h1>
      {number && (
        <p className="text-sm text-muted-ink">
          Order <span className="font-semibold text-ink">{number}</span>
          {total > 0 && <> · {aed(total)}</>}. A confirmation is on its way to your email.
        </p>
      )}
      {pay === "card" && <p className="text-sm text-ink">Your order is paid. We will call you to arrange delivery or collection.</p>}
      {pay === "bank" && (
        <div className="grid w-full gap-1.5 rounded-xl bg-surface-soft p-4 text-left text-sm">
          <p className="font-semibold text-ink">Please pay by bank transfer, with {number || "your order number"} as the reference:</p>
          <p className="whitespace-pre-wrap text-ink">{bank || "Bank details are in your confirmation email."}</p>
        </div>
      )}
      {pay === "cod" && <p className="text-sm text-ink">You pay by cash or card when your order arrives. We will call you to arrange delivery.</p>}
      {pay === "request" && <p className="text-sm text-ink">We will confirm availability and send you a payment link or invoice, usually within a working day.</p>}
      <div className="flex flex-wrap justify-center gap-2">
        <Action href="/products">Continue shopping</Action>
        <Action href="/account" variant="outline" arrow={false}>
          My orders
        </Action>
      </div>
    </div>
  );
}
