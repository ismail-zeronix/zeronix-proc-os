import { Printer } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BackButton } from "@/components/back-button";
import { LedgerEntries } from "@/components/ledger-entries";
import { PayslipEditor, VoidButton } from "@/components/payroll-ui";
import { StatStrip } from "@/components/stat-strip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireAccountant } from "@/lib/auth/session";
import { bankAccountOptions } from "@/lib/ledger/data";
import { currentOrgId } from "@/lib/org";
import { monthLabelOf } from "@/lib/payroll";
import { getPayslip, payItems } from "@/lib/payroll-data";
import { longDay, money } from "@/lib/quotation";

export const metadata = { title: "Payslip · Zeronix Accounts" };

/** One payslip: editable while it is a draft; once paid it is a record, with its ledger entry and a printable page. */
export default async function PayslipPage({ params }: PageProps<"/accounts/payroll/[id]">) {
  await requireAccountant();
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) notFound();
  const slip = await getPayslip(id);
  if (!slip) notFound();
  const orgId = await currentOrgId();
  const [items, accounts] = await Promise.all([payItems(), bankAccountOptions(orgId)]);
  const a = slip.attendance;
  const t = slip.totals;
  // before it is paid the advance balance is what could be taken back; after, it is what is left
  const owed = Math.max(0, slip.advanceBalance);

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <BackButton fallback="/accounts/payroll" />
        <div className="grid min-w-0 leading-tight">
          <h1 className="truncate text-base font-semibold">
            {slip.employeeName} · {monthLabelOf(slip.month)}
          </h1>
          <span className="truncate font-mono text-xs text-muted-foreground">{slip.number}</span>
        </div>
        <Badge variant={slip.status === "paid" ? "default" : slip.status === "void" ? "destructive" : "outline"} className="capitalize">
          {slip.status}
        </Badge>
        {slip.status === "paid" && slip.paidOn && <span className="text-xs text-muted-foreground">Paid {longDay(slip.paidOn)}{slip.bankName ? ` from ${slip.bankName}` : ""}</span>}
        <div className="ml-auto flex items-center gap-2">
          {slip.status !== "void" && (
            <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/print/payslip/${slip.id}`} target="_blank" />}>
              <Printer /> Payslip PDF
            </Button>
          )}
          {slip.status === "paid" && <VoidButton kind="payslip" id={slip.id} label={slip.number} />}
        </div>
      </div>

      <StatStrip
        items={[
          { label: "Total pay", value: money(t.gross), hint: `salary ${money(slip.baseSalary)}` },
          { label: "Deductions", value: money(t.deductions), hint: t.advanceRecovery ? `${money(t.advanceRecovery)} advance taken back` : undefined },
          { label: "Net pay", value: money(t.net) },
          { label: "Advance still owed", value: money(owed) },
        ]}
      />

      {a && (
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-5">
          {[
            ["Days in", a.daysIn, `${a.hours} h worked`],
            ["Late punch-ins", a.late, ""],
            ["Medical", a.medical, ""],
            ["Other leave", a.other, ""],
            ["Away, no reason", a.absent, a.absent ? "suggested deduction" : ""],
          ].map(([k, v, hint]) => (
            <div key={String(k)} className="bg-card px-4 py-2">
              <div className="text-xs text-muted-foreground">{k}</div>
              <div className="text-lg font-semibold tabular-nums">{v}</div>
              {hint && <div className="truncate text-xs text-muted-foreground">{hint}</div>}
            </div>
          ))}
        </div>
      )}

      {slip.status === "draft" ? (
        <PayslipEditor
          key={`${slip.id}-${slip.lines.length}`}
          slip={{ id: slip.id, number: slip.number, baseSalary: slip.baseSalary, notes: slip.notes, lines: slip.lines.map((l) => ({ typeId: l.typeId, label: l.label, kind: l.kind, systemKey: l.systemKey, amount: l.amount, note: l.note })) }}
          items={items.map((i) => ({ id: i.id, name: i.name, kind: i.kind, systemKey: i.systemKey, isActive: i.isActive }))}
          accounts={accounts}
          advanceOwed={owed}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card text-sm">
          <table className="w-full">
            <tbody className="divide-y">
              <tr>
                <td className="px-4 py-2">Basic salary</td>
                <td className="px-4 py-2 text-right tabular-nums">{money(slip.baseSalary)}</td>
              </tr>
              {slip.lines.map((l) => (
                <tr key={l.id}>
                  <td className="px-4 py-2">
                    {l.label}
                    {l.note && <div className="text-xs text-muted-foreground">{l.note}</div>}
                  </td>
                  <td className={`px-4 py-2 text-right tabular-nums ${l.kind === "deduction" ? "text-muted-foreground" : ""}`}>
                    {l.kind === "deduction" ? "-" : ""}
                    {money(l.amount)}
                  </td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td className="px-4 py-2">Net pay</td>
                <td className="px-4 py-2 text-right tabular-nums">{money(t.net)}</td>
              </tr>
            </tbody>
          </table>
          {slip.status === "void" && <p className="border-t px-4 py-2 text-xs text-destructive">Voided: {slip.voidReason}</p>}
          {slip.notes && <p className="border-t px-4 py-2 text-xs text-muted-foreground">Note: {slip.notes}</p>}
        </div>
      )}

      {slip.status !== "draft" && <LedgerEntries refs={[{ sourceType: "payslip", sourceId: slip.id }]} />}
    </div>
  );
}
