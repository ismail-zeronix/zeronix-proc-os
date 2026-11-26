import "server-only";
import { db, schema } from "@/db";
import { billingState, supportEmail, type BillingState } from "@/lib/billing";
import { dubaiToday } from "@/lib/dates";
import { zeronixFeatures } from "@/lib/edition";

/** The signed-in organisation's plan (its own row, row-level security) and where it stands today. */
async function orgBilling(): Promise<{ state: BillingState; priceMonthly: number | null } | null> {
  const [org] = await db
    .select({ plan: schema.organizations.plan, trialEndsOn: schema.organizations.trialEndsOn, paidUntil: schema.organizations.paidUntil, priceMonthly: schema.organizations.priceMonthly })
    .from(schema.organizations)
    .limit(1);
  return org ? { state: billingState(org, dubaiToday()), priceMonthly: org.priceMonthly } : null;
}

/**
 * A slim line across the top for an organisation's admins in the last week of the trial or paid period, and once it is
 * past (SaaS install only). Nothing otherwise.
 */
export async function BillingBanner({ isAdmin }: { isAdmin: boolean }) {
  if (!isAdmin || zeronixFeatures()) return null;
  const b = await orgBilling().catch(() => null);
  if (!b || b.state.tone === "ok") return null;
  const bad = b.state.tone === "bad";
  return (
    <div role="status" className={`px-3 py-1.5 text-center text-xs ${bad ? "bg-destructive text-white" : "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200"}`}>
      {b.state.label}. To keep using ZeronixOS, write to{" "}
      <a href={`mailto:${supportEmail()}`} className="font-medium underline">
        {supportEmail()}
      </a>
      .
    </div>
  );
}

/** Admin overview: the organisation's plan, its dates and how to renew (SaaS install only). */
export async function PlanCard() {
  if (zeronixFeatures()) return null;
  const b = await orgBilling();
  if (!b) return null;
  const { state } = b;
  const color = state.tone === "bad" ? "text-destructive" : state.tone === "warn" ? "text-amber-700 dark:text-amber-400" : "";
  const plan = state.plan === "trial" ? "Free trial" : state.plan === "paid" ? "Subscription" : "Free";
  return (
    <section aria-label="Your plan" className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border bg-card px-3 py-2 text-sm">
      <span className="font-medium">{plan}</span>
      <span className={color}>{state.label}</span>
      {b.priceMonthly != null && <span className="text-muted-foreground">AED {b.priceMonthly.toLocaleString("en-US", { minimumFractionDigits: 2 })} a month before VAT</span>}
      {state.plan !== "free" && (
        <span className="text-muted-foreground sm:ml-auto">
          To renew or change the plan:{" "}
          <a href={`mailto:${supportEmail()}`} className="font-medium text-foreground underline">
            {supportEmail()}
          </a>
        </span>
      )}
    </section>
  );
}
