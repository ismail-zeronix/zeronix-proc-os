import { ListPager, SortHead } from "@/components/list-controls";
import { LIST_PAGE } from "@/components/list-page";
import { NewCustomerDialog } from "@/components/party-pickers";
import { PageToolbar } from "@/components/page-toolbar";
import { Segmented } from "@/components/segmented";
import { listCustomers, type CustomerRow } from "@/lib/accounts-data";
import type { Access } from "@/lib/auth/session";
import { financeViewerOf } from "@/lib/auth/visibility";
import { dubaiToday } from "@/lib/dates";
import { pageOf, readList, sortRows } from "@/lib/list-params";
import { addDays, money } from "@/lib/quotation";
import { param, type SalesBase } from "@/lib/sales-base";
import { customerOwnerUsers } from "@/lib/sales-data";
import { CustomersTable, type Flag } from "./customers-table";

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
export async function CustomersView({ access, base, searchParams }: { access: Access; base: SalesBase; searchParams: Record<string, string | string[] | undefined> }) {
  const v = param(searchParams.view);
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

  const path = `${base}/customers`;
  const list = readList(searchParams, ["name", "sales", "owed", "paid"], { sort: "owed", dir: "desc" });
  const filtered = all.filter((c) => view.match(c, me));
  // the default order is the most overdue first, as the data comes
  const sorted = searchParams.sort ? sortRows(filtered, { name: (c) => c.name, sales: (c) => c.sales, owed: (c) => c.owed, paid: (c) => c.lastPaid }, list) : filtered;
  const rows = pageOf(sorted, list).map((c) => ({ ...c, flags: flagsOf(c) }));
  const head = (label: string, col: string, align?: "right") => <SortHead label={label} col={col} path={path} sp={searchParams} list={list} align={align} />;
  const owed = all.reduce((s, c) => s + c.owed, 0);
  const overdue = all.reduce((s, c) => s + c.overdue, 0);

  return (
    <div className={LIST_PAGE}>
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
            href: x.key === "all" ? path : `${path}?view=${x.key}`,
            label: `${x.label} ${all.filter((c) => x.match(c, me)).length}`,
            title: `Show ${x.label.toLowerCase()} customers`,
            active: view.key === x.key,
          }))}
        />
        {access.finance && <NewCustomerDialog defaultOpen={param(searchParams.new) === "1"} goTo={`${base}/customers`} />}
      </PageToolbar>
      <CustomersTable
        rows={rows}
        users={users}
        canEdit={access.seesAll}
        crm={access.apps.includes("crm")}
        today={today}
        selectable={access.finance}
        heads={{ name: head("Customer", "name"), sales: head("Sales", "sales", "right"), owed: head("Owes", "owed", "right"), paid: head("Last paid", "paid") }}
        pager={<ListPager path={path} sp={searchParams} list={list} total={filtered.length} />}
        empty={all.length ? "No customers in this view." : "No customers yet. A company becomes a customer when its deal is won, or add one with New customer."}
      />
    </div>
  );
}
