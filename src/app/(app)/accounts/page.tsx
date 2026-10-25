import { HBarPanel } from "@/components/charts/hbar-panel";
import { InvoiceTable } from "@/components/invoice-table";
import { PageToolbar } from "@/components/page-toolbar";
import { StatStrip } from "@/components/stat-strip";
import { receivables } from "@/lib/accounts-data";
import { requireApp } from "@/lib/auth/session";
import { money } from "@/lib/quotation";

export const metadata = { title: "Accounts · Zeronix" };

/** Money owed today: totals, how late it is, and the open invoices with the most overdue first. */
export default async function AccountsOverview() {

  await requireApp("accounts");
  const r = await receivables();
  const overdueCount = r.open.filter((i) => i.state.key === "overdue").length;
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
  return (
    <div className="grid gap-3">
      <PageToolbar title="Money owed" meta={`${plural(r.open.length, "open invoice")}`} />
      <StatStrip
        items={[
          { label: "Customers owe", value: money(r.owed), hint: `${plural(r.open.length, "invoice")} not fully paid` },
          { label: "Overdue", value: money(r.overdue), hint: overdueCount ? `${plural(overdueCount, "invoice")} past the due date` : "nothing late" },
          { label: "Due in the next 7 days", value: money(r.dueSoon) },
          { label: "Collected this month", value: money(r.collectedThisMonth) },
        ]}
      />
      <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <InvoiceTable rows={r.open} empty="Nothing owed. Every invoice is paid." />
        <HBarPanel
          title="How late"
          hint="Unpaid amounts by days past the due date"
          color="var(--series-2)"
          views={[
            {
              key: "amount",
              label: "Amount",
              format: "aed",
              unit: "AED owed",
              empty: "Nothing owed.",
              data: r.buckets.map((b) => ({ label: b.label, value: b.amount, note: plural(b.count, "invoice") })),
            },
            { key: "count", label: "Invoices", format: "count", unit: "invoices", empty: "Nothing owed.", data: r.buckets.map((b) => ({ label: b.label, value: b.count })) },
          ]}
        />
      </div>
    </div>
  );
}
