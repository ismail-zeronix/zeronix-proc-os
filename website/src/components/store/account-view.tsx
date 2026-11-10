"use client";

import { LogOut, Package } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { aed, Field, input } from "./fields";

interface Account {
  customer: { email: string; name: string; phone: string; company: string; trn: string; address: { emirate: string; area: string; street: string } };
  orders: { number: string; status: string; total: string; payment: string; items: { name: string; qty: number }[]; createdAt: string }[];
}

const EMIRATES = ["Dubai", "Abu Dhabi", "Sharjah", "Ajman", "Umm Al Quwain", "Ras Al Khaimah", "Fujairah"];
const STATUS: Record<string, string> = { new: "Received", confirmed: "Confirmed", paid: "Paid", shipped: "On the way", delivered: "Delivered", cancelled: "Cancelled" };

async function post(body: Record<string, unknown>) {
  const res = await fetch("/api/account", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  const data = await res?.json().catch(() => ({}));
  return { ok: Boolean(res?.ok), error: (data?.error as string) ?? "Something went wrong. Please try again." };
}

/** Email → 6-digit code → signed in. No passwords. */
function SignIn({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  return (
    <div className="mx-auto grid w-full max-w-sm gap-4 rounded-card border border-line/70 bg-white p-5">
      <div>
        <h1 className="text-xl font-semibold text-ink">Sign in</h1>
        <p className="mt-1 text-sm text-muted-ink">{step === "email" ? "We email you a 6-digit code. No password needed." : `Enter the code we sent to ${email}.`}</p>
      </div>
      <form
        className="grid gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setMsg("");
          const res = step === "email" ? await post({ action: "code", email }) : await post({ action: "verify", email, code });
          setBusy(false);
          if (!res.ok) return setMsg(res.error);
          if (step === "email") setStep("code");
          else onDone();
        }}
      >
        {step === "email" ? (
          <Field label="Email">
            <input type="email" required autoComplete="email" className={input} value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
        ) : (
          <Field label="Code">
            <input required inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} className={cn(input, "text-center text-xl tracking-[0.4em]")} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} autoFocus />
          </Field>
        )}
        {msg && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{msg}</p>}
        <button type="submit" disabled={busy} className="inline-flex h-11 items-center justify-center rounded-full bg-cta px-5 text-sm font-semibold text-brand-950 hover:bg-cta-strong disabled:opacity-60">
          {busy ? "Please wait…" : step === "email" ? "Email me a code" : "Sign in"}
        </button>
        {step === "code" && (
          <button type="button" className="text-xs font-semibold text-brand-800" onClick={() => (setStep("email"), setCode(""), setMsg(""))}>
            Use another email or send a new code
          </button>
        )}
      </form>
    </div>
  );
}

function Profile({ account, onSaved }: { account: Account; onSaved: () => void }) {
  const c = account.customer;
  const [f, setF] = useState({ name: c.name, phone: c.phone, company: c.company, trn: c.trn, emirate: c.address.emirate || "Dubai", area: c.address.area, street: c.address.street });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const patch = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  return (
    <form
      className="grid gap-3 rounded-card border border-line/70 bg-white p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const res = await fetch("/api/account", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: f.name, phone: f.phone, company: f.company, trn: f.trn, address: { emirate: f.emirate, area: f.area, street: f.street } }),
        }).catch(() => null);
        const data = await res?.json().catch(() => ({}));
        setMsg(res?.ok ? { ok: true, text: "Saved" } : { ok: false, text: data?.error ?? "Could not save" });
        if (res?.ok) onSaved();
      }}
    >
      <h2 className="text-base font-semibold text-ink">Your details</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Full name">
          <input className={input} value={f.name} onChange={(e) => patch({ name: e.target.value })} />
        </Field>
        <Field label="Mobile">
          <input type="tel" className={input} value={f.phone} onChange={(e) => patch({ phone: e.target.value })} />
        </Field>
        <Field label="Company">
          <input className={input} value={f.company} onChange={(e) => patch({ company: e.target.value })} />
        </Field>
        <Field label="TRN">
          <input inputMode="numeric" className={input} value={f.trn} onChange={(e) => patch({ trn: e.target.value })} />
        </Field>
        <Field label="Emirate">
          <select className={input} value={f.emirate} onChange={(e) => patch({ emirate: e.target.value })}>
            {EMIRATES.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </Field>
        <Field label="Area">
          <input className={input} value={f.area} onChange={(e) => patch({ area: e.target.value })} />
        </Field>
        <Field label="Building, street, office or villa" className="sm:col-span-2">
          <input className={input} value={f.street} onChange={(e) => patch({ street: e.target.value })} />
        </Field>
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" className="inline-flex h-10 items-center rounded-full bg-brand-900 px-5 text-sm font-semibold text-white hover:bg-brand-800">
          Save
        </button>
        {msg && <span className={cn("text-sm", msg.ok ? "text-brand-700" : "text-red-700")}>{msg.text}</span>}
      </div>
    </form>
  );
}

export function AccountView() {
  const router = useRouter();
  const next = useSearchParams().get("next");
  const [account, setAccount] = useState<Account | null | "loading">("loading");
  const load = useCallback(() => {
    fetch("/api/account", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((a) => setAccount(a?.customer ? a : null))
      .catch(() => setAccount(null));
  }, []);
  useEffect(load, [load]);

  if (account === "loading") return <p className="py-10 text-center text-sm text-muted-ink">Loading…</p>;
  if (!account)
    return (
      <SignIn
        onDone={() => {
          if (next?.startsWith("/")) router.push(next);
          else load();
        }}
      />
    );

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="grid gap-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-ink">My account</h1>
            <p className="text-sm text-muted-ink">{account.customer.email}</p>
          </div>
          <button type="button" onClick={async () => (await post({ action: "logout" }), setAccount(null))} className="inline-flex h-10 items-center gap-2 rounded-full border border-line px-4 text-sm font-semibold text-brand-900 hover:border-brand-900">
            <LogOut className="size-4" /> Sign out
          </button>
        </div>
        <Profile account={account} onSaved={load} />
      </div>
      <section className="grid gap-2 rounded-card border border-line/70 bg-white p-4">
        <h2 className="text-base font-semibold text-ink">My orders</h2>
        {account.orders.length === 0 && <p className="text-sm text-muted-ink">No orders yet.</p>}
        <ul className="grid gap-2">
          {account.orders.map((o) => (
            <li key={o.number} className="grid gap-1 rounded-xl border border-line/70 p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Package className="size-4 text-brand-700" />
                <span className="font-semibold">{o.number}</span>
                <span className="rounded-full bg-surface px-2 py-0.5 text-xs font-semibold text-brand-900">{STATUS[o.status] ?? o.status}</span>
                <span className="ml-auto font-semibold tabular-nums">{aed(o.total)}</span>
              </div>
              <p className="line-clamp-2 text-xs text-muted-ink">{o.items.map((i) => `${i.qty} × ${i.name}`).join(", ")}</p>
              <p className="text-xs text-muted-ink">{new Date(o.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
