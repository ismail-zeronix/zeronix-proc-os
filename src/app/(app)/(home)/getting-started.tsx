import { CheckCircle2, Circle } from "lucide-react";
import Link from "next/link";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { getBrandRow } from "@/lib/brand";
import { printedBank } from "@/lib/printed-bank";
import { getSetting } from "@/lib/settings";

/**
 * A new company's first steps, for its admins on the home screen: what its documents need before the first quote and
 * tax invoice go out. Each step is read from the real settings, so it ticks itself; the card goes away once all are done.
 */
export async function GettingStarted() {
  const [brand, trn, bank, docStyle, [people]] = await Promise.all([
    getBrandRow(),
    getSetting("quote_trn"),
    printedBank().catch(() => null),
    getSetting("doc_style"),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.users).where(eq(schema.users.isActive, true)),
  ]);
  const steps = [
    { done: !!brand?.address.trim() && !!brand?.mainPhone.trim(), label: "Company name, address and phone", hint: "They print on every quote and invoice.", href: "/admin/settings" },
    { done: !!brand?.logoB64, label: "Your logo", hint: "Shown on documents and email signatures.", href: "/admin/settings" },
    { done: !!trn.trim(), label: "VAT registration (TRN)", hint: "A UAE tax invoice must show it.", href: "/accounts/settings/vat" },
    { done: !!(bank && (bank.iban || bank.accountNumber)), label: "Bank account for customer payments", hint: "Printed on invoices and proformas.", href: "/accounts/settings/bank" },
    { done: !!docStyle.trim(), label: "Choose how documents look", hint: "Classic, Bold or Minimal, in your colours.", href: "/accounts/settings/templates" },
    { done: people.n > 1, label: "Invite your team", hint: "A one-time link each; they choose their own password.", href: "/admin/users" },
  ];
  const left = steps.filter((s) => !s.done).length;
  if (!left) return null;
  return (
    <section aria-label="Getting started" className="grid gap-2 rounded-xl border bg-card p-3 md:p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium">Getting started</h2>
        <span className="text-xs text-muted-foreground">
          {steps.length - left} of {steps.length} done
        </span>
      </div>
      <ul className="grid gap-1 sm:grid-cols-2">
        {steps.map((s) => (
          <li key={s.label}>
            <Link href={s.href} className="flex items-start gap-2 rounded-md p-1.5 text-sm hover:bg-muted">
              {s.done ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" /> : <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
              <span className="grid">
                <span className={s.done ? "text-muted-foreground line-through" : "font-medium"}>{s.label}</span>
                {!s.done && <span className="text-xs text-muted-foreground">{s.hint}</span>}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
