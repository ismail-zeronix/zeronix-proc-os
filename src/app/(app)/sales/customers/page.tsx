import { PageToolbar } from "@/components/page-toolbar";
import { Segmented } from "@/components/segmented";
import { listCustomers, type CustomerRow } from "@/lib/accounts-data";
import { requireApp } from "@/lib/auth/session";
import { financeViewerOf } from "@/lib/auth/visibility";
import { dubaiToday } from "@/lib/dates";
import { addDays, money } from "@/lib/quotation";
import { customerOwnerUsers } from "@/lib/sales-data";
import { CustomersTable, type Flag } from "./customers-table";

export const metadata = { title: "Customers · Zeronix Sales" };

const VIEWS = [
  { key: "all", label: "All", match: () => true },
  { key: "mine", label: "Mine", match: (c: CustomerRow, me: number) => c.owners.some((o) => o.id === me) },
  { key: "owes", label: "Owe us", match: (c: CustomerRow) => c.owed > 0 },
  { key: "overdue", label: "Overdue", match: (c: CustomerRow) => c.overdue > 0 },
  { key: "active", label: "In progress", match: (c: CustomerRow) => c.openDeals + c.openQuotes + c.toDeliver > 0 },
  { key: "no-trn", label: "No TRN", match: (c: CustomerRow) => !c.trn },
] as const;

/**
 * Customers: every company with a won deal or an order (leads stay in CRM › Leads). Who looks after them, what is in
 * progress, what they bought and what they owe. Biggest overdue first. Right-click a row for its actions and owners.
 */
export default async function CustomersPage({ searchParams }: PageProps<"/sales/customers">) {
  const access = await requireApp("sales");
  const v = (await searchParams).view;
  const view = VIEWS.find((x) => x.key === v) ?? VIEWS[0];
  const [all, users] = await Promise.all([listCustomers(financeViewerOf(access)), customerOwnerUsers()]);
  const today = dubaiToday();
  const me = access.user.id;

  // the three biggest buyers are "Top"
  const top = new Set(
    [...all]
      .filter((c) => c.sales > 0)
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 3)
      .map((c) => c.id),
  );
  const monthAgo = addDays(today, -30);
  const flagsOf = (c: CustomerRow): Flag[] =>
    [
      top.has(c.id) && "top",
      c.since && c.since >= monthAgo && "new",
      c.orders > 1 && "repeat",
      !c.trn && "noTrn",
      !c.contact && "noContact",
    ].filter((f): f is Flag => !!f);

  const rows = all.filter((c) => view.match(c, me)).map((c) => ({ ...c, flags: flagsOf(c) }));
  const owed = all.reduce((s, c) => s + c.owed, 0);
  const overdue = all.reduce((s, c) => s + c.overdue, 0);

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
      <PageToolbar
        title="Customers"
        meta={
          <>
            {[`${all.length} customer${all.length === 1 ? "" : "s"}`, owed ? `owe ${money(owed)}` : "", overdue ? `${money(overdue)} overdue` : ""].filter(Boolean).join(" · ")}
            <span className="hidden md:inline"> · right-click a row for more</span>
          </>
        }
      >
        <Segmented
          items={VIEWS.map((x) => ({
            href: x.key === "all" ? "/sales/customers" : `/sales/customers?view=${x.key}`,
            label: `${x.label} ${all.filter((c) => x.match(c, me)).length}`,
            title: `Show ${x.label.toLowerCase()} customers`,
            active: view.key === x.key,
          }))}
        />
      </PageToolbar>
      <CustomersTable
        rows={rows}
        users={users}
        canEdit={access.seesAll}
        crm={access.apps.includes("crm")}
        today={today}
        empty={all.length ? "No customers in this view." : "No customers yet. A company becomes a customer when its deal is won."}
      />
    </div>
  );
}
