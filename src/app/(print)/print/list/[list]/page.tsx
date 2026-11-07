import { notFound } from "next/navigation";
import { PrintPage } from "@/components/print-page";
import { ReportPaper } from "@/components/report-view";
import { requireFinance } from "@/lib/auth/session";
import { TZ } from "@/lib/dates";
import { canExportList, isExportList, listReport, parseIds } from "@/lib/list-exports";
import { quoteBrand } from "@/lib/quote-view";

export const metadata = { title: "Selected rows" };

const BACK: Record<string, string> = { vouchers: "payments-made", receipts: "payments", "credit-notes": "credit-notes", "debit-notes": "debit-notes" };

/** The rows ticked on an Accounts list on A4 paper. */
export default async function PrintList({ params, searchParams }: PageProps<"/print/list/[list]">) {
  const access = await requireFinance();
  const list = (await params).list;
  if (!isExportList(list) || !canExportList(list, access)) notFound();
  const ids = (await searchParams).ids;
  const [report, brand] = await Promise.all([listReport(list, parseIds(Array.isArray(ids) ? ids[0] : ids)), quoteBrand()]);
  const when = new Date().toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: TZ });
  return (
    <PrintPage back={`/accounts/${BACK[list] ?? list}`} number={report.title} landscape={report.landscape}>
      <ReportPaper report={report} brand={brand} generated={`Printed by ${access.user.name} on ${when}. Amounts in AED.`} />
    </PrintPage>
  );
}
