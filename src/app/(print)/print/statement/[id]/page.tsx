import { notFound } from "next/navigation";
import { StatementDocument } from "@/components/money-documents";
import { PrintPage } from "@/components/print-page";
import { statement } from "@/lib/accounts-data";
import { requireApp } from "@/lib/auth/session";
import { canSeeCompany, financeViewerOf } from "@/lib/auth/visibility";
import { dubaiToday } from "@/lib/dates";
import { quoteBrand } from "@/lib/quote-view";

export const metadata = { title: "Statement of account" };

const isDay = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** Statement of account for a customer (id = company). Default period: 1 January this year to today. */
export default async function PrintStatement({ params, searchParams }: PageProps<"/print/statement/[id]">) {
  const access = await requireApp("sales");
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1 || !(await canSeeCompany(financeViewerOf(access), id))) notFound();
  const sp = await searchParams;
  const today = dubaiToday();
  const to = isDay(sp.to) ? sp.to : today;
  const from = isDay(sp.from) && sp.from <= to ? sp.from : `${to.slice(0, 4)}-01-01`;
  const [s, brand] = await Promise.all([statement(id, from, to), quoteBrand()]);
  if (!s) notFound();
  return (
    <PrintPage back={`/sales/customers/${id}`} number={`Statement ${s.company.name}`}>
      <StatementDocument brand={brand} s={{ customer: { name: s.company.name, emirate: s.company.emirate, trn: s.company.trn }, from, to, opening: s.opening, lines: s.lines, closing: s.closing }} />
    </PrintPage>
  );
}
