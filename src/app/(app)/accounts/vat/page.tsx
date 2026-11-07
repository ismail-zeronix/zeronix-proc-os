import { eq } from "drizzle-orm";
import { FileDown, Printer, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { ExportButton } from "@/components/export-button";
import { PageToolbar } from "@/components/page-toolbar";
import { StatStrip } from "@/components/stat-strip";
import { Button } from "@/components/ui/button";
import { FileVatDialog, PayVatDialog, UndoVatButton, VatPeriodPicker } from "@/components/vat-ui";
import { schema } from "@/db";
import { requireAccountant } from "@/lib/auth/session";
import { dubaiToday } from "@/lib/dates";
import { bankAccountOptions } from "@/lib/ledger/data";
import { ensureLedger } from "@/lib/ledger/setup";
import { advancesHeld, filedReturns, vatProblems, vatReturnFor } from "@/lib/ledger/vat";
import { currentOrgId, orgProfile, withOrg } from "@/lib/org";
import { longDay, money } from "@/lib/quotation";
import { emirateKnown, vatDueDate, vatPeriodOf, vatPeriods, type Vat201 } from "@/lib/tax/vat201";

export const metadata = { title: "VAT return · Zeronix Accounts" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** The VAT 201 return of a period: worked out live until it is filed, then kept as it was filed. */
export default async function VatPage({ searchParams }: PageProps<"/accounts/vat">) {
  await requireAccountant();
  const orgId = await currentOrgId();
  const today = dubaiToday();
  const sp = await searchParams;
  const [org, settings, filed, accounts, advances] = await Promise.all([
    orgProfile(orgId),
    withOrg(orgId, async (tx) => {
      await ensureLedger(tx, orgId);
      return (await tx.select().from(schema.accountingSettings).where(eq(schema.accountingSettings.organizationId, orgId)))[0];
    }),
    filedReturns(orgId),
    bankAccountOptions(orgId),
    advancesHeld(orgId),
  ]);
  const months = settings.vatPeriodMonths;
  const start = settings.vatPeriodStartMonth;
  // nothing before the ledger starts can be on a return from here
  const periods = vatPeriods(today, months, start).filter((p) => !settings.cutoverDate || p.to >= settings.cutoverDate);
  if (!periods.length) periods.push(vatPeriodOf(today, months, start));
  for (const f of filed) if (!periods.some((p) => p.from === f.periodStart)) periods.push(vatPeriodOf(f.periodStart, months, start));
  const firstOpen = [...periods].reverse().find((p) => p.to < today && !filed.some((f) => f.periodEnd === p.to) && (!filed.length || p.to > filed[0].periodEnd));
  const asked = one(sp.from);
  const period = periods.find((p) => p.from === asked) ?? firstOpen ?? periods[0];
  const thisFiled = filed.find((f) => f.periodEnd === period.to);
  const live = thisFiled ? null : await withOrg(orgId, (tx) => vatReturnFor(tx, orgId, period.from, period.to));
  const boxes = (thisFiled ? thisFiled.boxes : live?.boxes) as Vat201;
  const problems = await vatProblems(period.from, period.to);
  const over = period.to < today;
  const payable = boxes.payable;
  const q = `period=custom&from=${period.from}&to=${period.to}`;
  const isLatest = filed[0]?.id === thisFiled?.id;

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
      <PageToolbar
        title="VAT return"
        meta={thisFiled ? `Filed ${longDay(thisFiled.filedAt.toISOString().slice(0, 10))}` : over ? `Not filed. Due ${longDay(period.due)}` : "Period still running"}
      >
          <div className="flex flex-wrap items-center gap-1.5">
            <VatPeriodPicker value={period.from} periods={periods.map((p) => ({ from: p.from, label: `${p.label}${filed.some((f) => f.periodEnd === p.to) ? " · filed" : ""}` }))} />
            <Button variant="outline" size="sm" nativeButton={false} render={<a href={`/print/report/vat-return?${q}`} target="_blank" rel="noopener" />}>
              <Printer /> Print
            </Button>
            <ExportButton variant="outline" size="sm" url={`/api/accounts/vat/faf?from=${period.from}&to=${period.to}`} label={`FTA Audit File ${period.label}`} title="The FTA Audit File (FAF) for this period, as CSV">
              <FileDown /> Audit file
            </ExportButton>
            {!thisFiled && over && <FileVatDialog from={period.from} to={period.to} label={period.label} payable={payable} blocked={live?.difference ? `The VAT accounts and this return differ by ${money(live.difference)}: a journal touched a VAT account without a tax code.` : null} />}
            {thisFiled && !thisFiled.paidOn && payable !== 0 && <PayVatDialog id={thisFiled.id} payable={payable} periodEnd={thisFiled.periodEnd} accounts={accounts} />}
            {thisFiled && isLatest && <UndoVatButton id={thisFiled.id} label={period.label} />}
          </div>
      </PageToolbar>

      <StatStrip
        items={[
          { label: "VAT due", value: money(boxes.totalOutput), hint: "Box 12" },
          { label: "Recoverable", value: money(boxes.totalInput), hint: "Box 13" },
          { label: payable >= 0 ? "Payable" : "Refundable", value: money(Math.abs(payable)), hint: thisFiled?.paidOn ? `Settled ${longDay(thisFiled.paidOn)}` : `Box 14 · due ${longDay(vatDueDate(period.to))}` },
          { label: "Tax invoice checks", value: String(problems.length), hint: problems.length ? "documents to look at" : "nothing to look at" },
        ]}
      />

      {!emirateKnown(org.emirate) && <Notice>Our emirate is not set, so box 1 cannot be split. Set it in Accounts › Settings › VAT registration.</Notice>}
      {live && live.difference !== 0 && <Notice>The VAT accounts differ from this return by {money(live.difference)}: a journal touched a VAT account without a tax code. Correct it before filing.</Notice>}
      {problems.length > 0 && (
        <Notice>
          {problems.length} document{problems.length === 1 ? "" : "s"} in this period could be questioned by the FTA.{" "}
          <Link className="font-medium underline" href={`/accounts/reports?r=vat-check&${q}`}>
            See the checks
          </Link>
          .
        </Notice>
      )}
      {!thisFiled && advances > 0 && <Notice>{money(advances)} is held as customer advances. VAT can be due when an advance for a supply is received, and this return leaves it out: ask your accountant.</Notice>}
      {thisFiled && (
        <p className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">
          Filed as it stood on {longDay(thisFiled.filedAt.toISOString().slice(0, 10))}
          {thisFiled.reference ? `, reference ${thisFiled.reference}` : ""}. The books are locked up to {longDay(thisFiled.periodEnd)}: a later correction goes in the next return.
          {thisFiled.paidOn ? ` ${payable >= 0 ? "Paid" : "Refund received"} ${longDay(thisFiled.paidOn)}${thisFiled.paymentReference ? `, ${thisFiled.paymentReference}` : ""}.` : ""}
        </p>
      )}

      <section className="overflow-x-auto rounded-xl border bg-card" aria-label="VAT 201 boxes">
        <table className="w-full min-w-[34rem] text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="w-14 px-3 py-2 text-left font-medium">Box</th>
              <th className="px-3 py-2 text-left font-medium">
                {period.label} · {longDay(period.from)} to {longDay(period.to)}
              </th>
              <th className="w-36 px-3 py-2 text-right font-medium">Amount (AED)</th>
              <th className="w-36 px-3 py-2 text-right font-medium">VAT (AED)</th>
            </tr>
          </thead>
          <tbody>
            {boxes.rows.map((r, i) =>
              r.heading ? (
                <tr key={i} className="border-b bg-muted/40">
                  <td colSpan={4} className="px-3 py-1.5 text-xs font-semibold">
                    {r.label}
                  </td>
                </tr>
              ) : (
                <tr key={i} className={`border-b last:border-0 ${r.strong ? "font-semibold" : ""}`}>
                  <td className="px-3 py-1 text-muted-foreground tabular-nums">{r.box}</td>
                  <td className="px-3 py-1">{r.label}</td>
                  <td className="px-3 py-1 text-right tabular-nums">{r.amount == null ? "" : money(r.amount)}</td>
                  <td className="px-3 py-1 text-right tabular-nums">{r.vat == null ? "" : money(r.vat)}</td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </section>
      <p className="px-1 text-xs text-muted-foreground">
        Worked out from the ledger, by the tax code on each line. Copy these boxes into the FTA portal, then file here to lock the period. Your accountant should check the return before it is filed. Purchases where VAT cannot be reclaimed (such as entertainment) are entered as Out of scope at their full price.
      </p>
    </div>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm">
      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
      <span>{children}</span>
    </p>
  );
}
