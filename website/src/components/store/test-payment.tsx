"use client";

import { FlaskConical } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { aed } from "./fields";

/** Only links back to this site are followed, so the page cannot be used to send people elsewhere. */
function sameSite(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw, window.location.origin);
    return u.origin === window.location.origin ? u.toString() : null;
  } catch {
    return null;
  }
}

/**
 * TEST MODE ONLY: what Nomod's Hosted Checkout would do, without Nomod. The portal records the clicked result (only
 * while it runs with a dummy key) and the customer goes back to the order page, which checks it like a real payment.
 */
export function TestPayment() {
  const sp = useSearchParams();
  const id = sp.get("id") ?? "";
  const amount = Number(sp.get("amount") ?? 0);
  const ref = (sp.get("ref") ?? "").slice(0, 20);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const finish = async (result: "paid" | "expired" | "cancelled") => {
    setBusy(true);
    setError("");
    const res = await fetch("/api/order/payment", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "test", id, result }) }).catch(() => null);
    const back = sameSite(sp.get(result === "paid" ? "ok" : result === "cancelled" ? "cancel" : "fail"));
    if (!res?.ok || !back) {
      setBusy(false);
      return setError("Test payments are switched off (the shop is not in test mode), or this link is broken.");
    }
    window.location.assign(back);
  };

  return (
    <div className="mx-auto grid w-full max-w-md gap-4 rounded-card border-2 border-dashed border-amber-400 bg-white p-6">
      <div className="flex items-center gap-2 text-amber-700">
        <FlaskConical className="size-5" />
        <span className="text-xs font-semibold tracking-wide uppercase">Test mode: no real payment</span>
      </div>
      <div>
        <h1 className="text-xl font-semibold text-ink">Pay {aed(amount)}</h1>
        <p className="text-sm text-muted-ink">Order {ref}. This page stands in for Nomod&apos;s payment page while the shop uses a dummy key.</p>
      </div>
      <div className="grid gap-2">
        <button type="button" disabled={busy} onClick={() => finish("paid")} className="h-11 rounded-full bg-cta font-semibold text-white hover:bg-cta-strong disabled:opacity-60">
          Pay successfully
        </button>
        <button type="button" disabled={busy} onClick={() => finish("expired")} className="h-11 rounded-full border border-red-300 font-semibold text-red-800 hover:bg-red-50 disabled:opacity-60">
          Card declined
        </button>
        <button type="button" disabled={busy} onClick={() => finish("cancelled")} className="h-11 rounded-full border border-line font-semibold text-muted-ink hover:bg-surface-soft disabled:opacity-60">
          Cancel and go back
        </button>
      </div>
      {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
    </div>
  );
}
