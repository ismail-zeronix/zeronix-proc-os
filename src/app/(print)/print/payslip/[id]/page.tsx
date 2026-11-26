import { notFound } from "next/navigation";
import { PayslipDocument } from "@/components/payslip-document";
import { PrintPage } from "@/components/print-page";
import { requireAccountant } from "@/lib/auth/session";
import { getPayslip } from "@/lib/payroll-data";
import { quoteBrand } from "@/lib/quote-view";

export const metadata = { title: "Payslip" };

/** A payslip as a printable page. Salaries are private: only admins and accountants open it. */
export default async function PrintPayslip({ params }: PageProps<"/print/payslip/[id]">) {
  await requireAccountant();
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) notFound();
  const slip = await getPayslip(id);
  if (!slip) notFound();
  return (
    <PrintPage back={`/accounts/payroll/${slip.id}`} number={slip.number} pdfHref={`/api/documents/payslip/${slip.id}/pdf`}>
      <PayslipDocument slip={slip} brand={await quoteBrand()} />
    </PrintPage>
  );
}
