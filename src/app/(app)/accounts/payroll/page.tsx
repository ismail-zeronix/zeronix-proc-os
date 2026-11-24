import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { PageToolbar } from "@/components/page-toolbar";
import { AdvanceDialog, GenerateButton, PayItemsPanel, SalaryInput, VoidButton } from "@/components/payroll-ui";
import { Segmented } from "@/components/segmented";
import { StatStrip } from "@/components/stat-strip";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LIST_PAGE } from "@/components/list-page";
import { requireAccountant } from "@/lib/auth/session";
import { dubaiToday } from "@/lib/dates";
import { bankAccountOptions } from "@/lib/ledger/data";
import { currentOrgId } from "@/lib/org";
import { isMonth, monthLabelOf } from "@/lib/payroll";
import { advanceBalances, advancesList, employees, monthSlips, payItems } from "@/lib/payroll-data";
import { longDay, money, round2 } from "@/lib/quotation";

export const metadata = { title: "Payroll · Zeronix Accounts" };

function shift(m: string, by: number) {
  const d = new Date(`${m}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + by);
  return d.toISOString().slice(0, 7);
}

const STATUS = { draft: "Draft", paid: "Paid", void: "Void" } as const;
const TABS = [
  ["payslips", "Payslips"],
  ["advances", "Advances"],
  ["items", "Pay items"],
] as const;

/** Salary, payslips and advances. Only admins and accountants open it: salaries are private. */
export default async function PayrollPage({ searchParams }: PageProps<"/accounts/payroll">) {
  await requireAccountant();
  const sp = await searchParams;
  const thisMonth = dubaiToday().slice(0, 7);
  const month = typeof sp.month === "string" && isMonth(sp.month) ? sp.month : thisMonth;
  const tab = TABS.some(([k]) => k === sp.tab) ? (sp.tab as (typeof TABS)[number][0]) : "payslips";
  /** A link that keeps the month and tab unless told otherwise (the defaults stay out of the address). */
  const q = (over: { tab?: string; month?: string }) => {
    const t = over.tab ?? tab;
    const m = over.month ?? month;
    const p = new URLSearchParams({ ...(t !== "payslips" ? { tab: t } : {}), ...(m !== thisMonth ? { month: m } : {}) });
    return `/accounts/payroll${p.size ? `?${p}` : ""}`;
  };

  const [people, slips, balances, accounts, items, advances] = await Promise.all([
    employees(),
    monthSlips(month),
    advanceBalances(),
    currentOrgId().then(bankAccountOptions),
    payItems(),
    tab === "advances" ? advancesList() : Promise.resolve([]),
  ]);
  const slipOf = new Map(slips.map((s) => [s.userId, s]));
  const withSalary = people.filter((p) => p.baseSalary > 0);
  const missing = withSalary.filter((p) => !slipOf.has(p.id)).length;
  const paid = slips.filter((s) => s.status === "paid");
  const owed = round2([...balances.values()].reduce((s, b) => s + Math.max(0, b.balance), 0));

  return (
    <div className={LIST_PAGE}>
      <PageToolbar title="Payroll" meta={monthLabelOf(month)}>
        <Segmented items={TABS.map(([k, label]) => ({ href: q({ tab: k }), label, title: label, active: k === tab }))} />
        {tab === "payslips" && (
          <>
            <Segmented items={[-2, -1, 0].map((i) => shift(thisMonth, i)).map((m) => ({ href: q({ month: m }), label: monthLabelOf(m).replace(/ 20(\d\d)$/, " '$1"), title: monthLabelOf(m), active: m === month }))} />
          </>
        )}
        <div className="ml-auto flex items-center gap-2">
          {tab === "payslips" && <GenerateButton month={month} missing={missing} />}
          <AdvanceDialog people={people.map((p) => ({ id: p.id, name: p.name }))} accounts={accounts} />
        </div>
      </PageToolbar>

      <StatStrip
        items={[
          { label: `Paid in ${monthLabelOf(month)}`, value: money(round2(paid.reduce((s, p) => s + p.net, 0))), hint: `${paid.length} of ${slips.length} payslip${slips.length === 1 ? "" : "s"}` },
          { label: "Still to pay", value: money(round2(slips.filter((s) => s.status === "draft").reduce((s, p) => s + p.net, 0))), hint: `${slips.filter((s) => s.status === "draft").length} draft` },
          { label: "Monthly payroll", value: money(round2(withSalary.reduce((s, p) => s + p.baseSalary, 0))), hint: `${withSalary.length} with a salary` },
          { label: "Advances owed back", value: money(owed) },
        ]}
      />

      {tab === "payslips" && (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead className="text-right">Monthly salary</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Total pay</TableHead>
                <TableHead className="text-right">Net</TableHead>
                <TableHead>Payslip</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {people.map((p) => {
                const s = slipOf.get(p.id);
                return (
                  <TableRow key={p.id}>
                    <TableCell>
                      <div className="font-medium">{p.name}</div>
                      <div className="text-xs text-muted-foreground">{p.jobTitle || p.email}</div>
                    </TableCell>
                    <TableCell className="text-right">
                      <SalaryInput key={`${p.id}-${p.baseSalary}`} userId={p.id} salary={p.baseSalary} />
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums sm:table-cell">{s ? money(s.gross) : "-"}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{s ? money(s.net) : "-"}</TableCell>
                    <TableCell>
                      {s ? (
                        <Link href={`/accounts/payroll/${s.id}`} className="inline-flex items-center gap-2 hover:underline">
                          <span className="font-mono text-xs">{s.number}</span>
                          <Badge variant={s.status === "paid" ? "default" : "outline"}>{STATUS[s.status]}</Badge>
                        </Link>
                      ) : p.baseSalary > 0 ? (
                        <span className="text-xs text-muted-foreground">Not made yet</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Set a salary first</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {tab === "advances" && (
        <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
          <div className="overflow-x-auto rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Taken back</TableHead>
                  <TableHead className="text-right">Owed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {people
                  .filter((p) => (balances.get(p.id)?.paid ?? 0) > 0)
                  .map((p) => {
                    const b = balances.get(p.id)!;
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell className="text-right tabular-nums">{money(b.paid)}</TableCell>
                        <TableCell className="text-right tabular-nums">{money(b.recovered)}</TableCell>
                        <TableCell className="text-right font-medium tabular-nums">{money(b.balance)}</TableCell>
                      </TableRow>
                    );
                  })}
                {![...balances.values()].some((b) => b.paid > 0) && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                      No advances yet. Press Pay advance.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <div className="overflow-x-auto rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Advance</TableHead>
                  <TableHead>Employee</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {advances.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="text-xs whitespace-nowrap">
                      <span className={`font-mono font-medium ${a.voidedAt ? "line-through" : ""}`}>{a.number}</span>
                      <div className="text-muted-foreground">{longDay(a.paidOn)}</div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{a.employeeName}</div>
                      {a.notes && <div className="text-xs text-muted-foreground">{a.notes}</div>}
                      {a.voidedAt && <div className="text-xs text-destructive">Voided: {a.voidReason}</div>}
                    </TableCell>
                    <TableCell className={`text-right tabular-nums ${a.voidedAt ? "text-muted-foreground line-through" : ""}`}>{money(a.amount)}</TableCell>
                    <TableCell className="text-right">{!a.voidedAt && <VoidButton kind="advance" id={a.id} label={a.number} />}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {tab === "items" && <PayItemsPanel items={items.map((i) => ({ id: i.id, name: i.name, kind: i.kind, systemKey: i.systemKey, isActive: i.isActive }))} />}
    </div>
  );
}
