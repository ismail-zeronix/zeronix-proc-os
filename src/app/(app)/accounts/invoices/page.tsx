import { InvoiceTable } from "@/components/invoice-table";
import { OpeningInvoiceDialog } from "@/components/opening-ui";
import { PageToolbar } from "@/components/page-toolbar";
import { Segmented } from "@/components/segmented";
import { listInvoices } from "@/lib/accounts-data";
import { requireFinance } from "@/lib/auth/session";

export const metadata = { title: "Invoices · Zeronix Accounts" };

const VIEWS = [
  { key: "open", label: "Not paid", match: (k: string) => k === "unpaid" || k === "part" || k === "overdue" },
  { key: "overdue", label: "Overdue", match: (k: string) => k === "overdue" },
  { key: "paid", label: "Paid", match: (k: string) => k === "paid" },
  { key: "cancelled", label: "Cancelled", match: (k: string) => k === "cancelled" },
  { key: "all", label: "All", match: () => true },
] as const;

/** Every tax invoice, filtered by where it stands today. */
export default async function InvoicesPage({ searchParams }: PageProps<"/accounts/invoices">) {
  await requireFinance();
  const v = (await searchParams).view;
  const view = VIEWS.find((x) => x.key === v) ?? VIEWS[0];
  const all = await listInvoices();
  const rows = all.filter((i) => view.match(i.state.key));
  return (
    <div className="grid gap-3">
      <PageToolbar title="Invoices" meta={`${rows.length} shown`}>
        <Segmented
          items={VIEWS.map((x) => ({
            href: x.key === "open" ? "/accounts/invoices" : `/accounts/invoices?view=${x.key}`,
            label: `${x.label} ${all.filter((i) => x.match(i.state.key)).length}`,
            title: x.label,
            active: view.key === x.key,
          }))}
        />
        <div className="ml-auto">
          <OpeningInvoiceDialog />
        </div>
      </PageToolbar>
      <InvoiceTable rows={rows} empty={all.length ? "Nothing in this view." : "No invoices yet. They are made from delivered orders (To invoice)."} />
    </div>
  );
}
