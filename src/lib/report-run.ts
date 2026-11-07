import "server-only";
import { LEDGER_REPORTS, runLedgerReport } from "@/lib/ledger/reports/data";
import { registerRunner } from "@/lib/ledger/reports/registers";
import { reportDef, type ReportParams } from "@/lib/report-centre";
import { isReport, type Report } from "@/lib/reports";
import { runReport } from "@/lib/reports-data";

/** Runs any report of the report centre: from the ledger, from the documents, or one of the earlier document reports. */
export async function runCentreReport(p: ReportParams): Promise<Report> {
  if (LEDGER_REPORTS.has(p.key)) return runLedgerReport(p);
  const reg = registerRunner(p.key);
  if (reg) return reg(p);
  if (isReport(p.key)) return runReport(p.key, p.from, p.to, p.label);
  throw new Error(`Unknown report ${p.key}`);
}

/** May this person open this report? Audit-type reports need the Accountant switch. */
export const canOpenReport = (key: string, access: { finance: boolean; accountant: boolean }) => access.finance && (!reportDef(key)?.accountant || access.accountant);
