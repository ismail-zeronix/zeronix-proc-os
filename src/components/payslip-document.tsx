import { Head } from "@/components/money-documents";
import type { QuoteBrand } from "@/components/quote-document";
import { methodLabel } from "@/lib/invoicing";
import { monthLabelOf } from "@/lib/payroll";
import type { PayslipView } from "@/lib/payroll-data";
import { longDay, money } from "@/lib/quotation";
import { aedInWords } from "@/lib/words";

/** A payslip on one A4 page: what the person earned, what was taken off, what they were paid and what attendance said. */
export function PayslipDocument({ slip, brand }: { slip: PayslipView; brand: QuoteBrand }) {
  const t = slip.totals;
  const earnings = slip.lines.filter((l) => l.kind === "earning");
  const deductions = slip.lines.filter((l) => l.kind === "deduction");
  const a = slip.attendance;
  const voided = slip.status === "void";
  return (
    <article className="relative bg-white p-6 text-[13px] leading-relaxed text-neutral-800 sm:p-10 print:p-0" aria-label={`Payslip ${slip.number}`}>
      {voided && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
          <span className="-rotate-30 rounded-xl border-8 border-red-600/30 px-8 py-2 text-7xl font-black tracking-widest text-red-600/25">VOID</span>
        </div>
      )}
      <Head brand={brand} title="PAYSLIP" number={slip.number} meta={[["Pay period", monthLabelOf(slip.month)], ["Status", slip.status === "paid" ? `Paid ${slip.paidOn ? longDay(slip.paidOn) : ""}` : slip.status === "void" ? "Void" : "Draft"]]} />

      <dl className="mt-6 grid grid-cols-[10rem_1fr] gap-x-4 gap-y-2">
        <dt className="text-neutral-500">Employee</dt>
        <dd className="font-semibold">{slip.employeeName}</dd>
        {slip.jobTitle && (
          <>
            <dt className="text-neutral-500">Position</dt>
            <dd>{slip.jobTitle}</dd>
          </>
        )}
      </dl>

      <div className="mt-6 grid grid-cols-2 gap-6">
        <section>
          <h2 className="border-b pb-1 text-xs font-semibold tracking-wide text-neutral-500 uppercase">Earnings</h2>
          <table className="mt-1 w-full">
            <tbody>
              <Row label="Basic salary" value={slip.baseSalary} />
              {earnings.map((l) => (
                <Row key={l.id} label={l.label} note={l.note} value={l.amount} />
              ))}
              <tr className="border-t font-semibold">
                <td className="py-1.5">Total earnings</td>
                <td className="py-1.5 text-right tabular-nums">{money(t.gross)}</td>
              </tr>
            </tbody>
          </table>
        </section>
        <section>
          <h2 className="border-b pb-1 text-xs font-semibold tracking-wide text-neutral-500 uppercase">Deductions</h2>
          <table className="mt-1 w-full">
            <tbody>
              {deductions.length === 0 && (
                <tr>
                  <td className="py-1 text-neutral-500">None</td>
                  <td />
                </tr>
              )}
              {deductions.map((l) => (
                <Row key={l.id} label={l.label} note={l.note} value={l.amount} />
              ))}
              <tr className="border-t font-semibold">
                <td className="py-1.5">Total deductions</td>
                <td className="py-1.5 text-right tabular-nums">{money(t.deductions)}</td>
              </tr>
            </tbody>
          </table>
        </section>
      </div>

      <section className="mt-6 flex items-center justify-between rounded-lg border-2 border-neutral-800 px-4 py-3">
        <div>
          <div className="text-xs text-neutral-500">Net pay</div>
          <div className="text-xs text-neutral-600 italic">{aedInWords(t.net)}</div>
        </div>
        <div className="text-2xl font-bold tabular-nums">{money(t.net)}</div>
      </section>

      {slip.status === "paid" && (
        <p className="mt-3 text-xs text-neutral-600">
          Paid by {methodLabel(slip.method ?? "bank")}
          {slip.bankName ? ` (${slip.bankName})` : ""}
          {slip.reference ? ` · Ref. ${slip.reference}` : ""}.
        </p>
      )}

      {a && (
        <section className="mt-6">
          <h2 className="border-b pb-1 text-xs font-semibold tracking-wide text-neutral-500 uppercase">Attendance in {monthLabelOf(slip.month)}</h2>
          <div className="mt-2 grid grid-cols-5 gap-3 text-center">
            {[
              ["Days in", a.daysIn],
              ["Late", a.late],
              ["Medical", a.medical],
              ["Other leave", a.other],
              ["Absent, no reason", a.absent],
            ].map(([k, v]) => (
              <div key={k} className="rounded-md bg-neutral-50 px-2 py-1.5">
                <div className="text-base font-semibold tabular-nums">{v}</div>
                <div className="text-[11px] text-neutral-500">{k}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {slip.notes && <p className="mt-4 text-xs text-neutral-600">Note: {slip.notes}</p>}
      {voided && <p className="mt-4 text-xs text-red-700">Voided: {slip.voidReason}</p>}

      <section className="mt-14 grid grid-cols-2 gap-8 text-xs text-neutral-600">
        <div>
          <div className="h-10 border-b border-neutral-400" />
          <div className="mt-1">Prepared by</div>
        </div>
        <div>
          <div className="h-10 border-b border-neutral-400" />
          <div className="mt-1">Received by (employee signature)</div>
        </div>
      </section>
    </article>
  );
}

function Row({ label, note, value }: { label: string; note?: string; value: number }) {
  return (
    <tr>
      <td className="py-1 pr-2">
        {label}
        {note && <div className="text-[11px] text-neutral-500">{note}</div>}
      </td>
      <td className="py-1 text-right tabular-nums">{money(value)}</td>
    </tr>
  );
}
