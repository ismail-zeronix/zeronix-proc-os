import { describe, expect, it } from "vitest";
import { advanceBalance, absenceDeduction, advancePostLines, dailyRate, isMonth, monthLabelOf, monthLastDay, payslipPostLines, payslipTotals, suggestRecovery, type PayLine } from "@/lib/payroll";

/** Accounts › Payroll: the money rules (no database). */

const line = (kind: "earning" | "deduction", amount: number, over: Partial<PayLine> = {}): PayLine => ({ label: kind, kind, amount, systemKey: null, ...over });

describe("months", () => {
  it("accepts YYYY-MM only", () => {
    expect(isMonth("2026-10")).toBe(true);
    expect(isMonth("2026-13")).toBe(false);
    expect(isMonth("2026-1")).toBe(false);
    expect(isMonth("")).toBe(false);
  });
  it("names the month and finds its last day", () => {
    expect(monthLabelOf("2026-10")).toBe("October 2026");
    expect(monthLastDay("2026-10")).toBe("2026-10-31");
    expect(monthLastDay("2026-02")).toBe("2026-02-28");
    expect(monthLastDay("2028-02")).toBe("2028-02-29");
  });
});

describe("absence", () => {
  it("is salary over 30 days, per day", () => {
    expect(dailyRate(3000)).toBe(100);
    expect(dailyRate(5000)).toBe(166.67);
  });
  it("never takes more than the salary", () => {
    expect(absenceDeduction(3000, 2)).toBe(200);
    expect(absenceDeduction(3000, 0)).toBe(0);
    expect(absenceDeduction(3000, 45)).toBe(3000);
  });
});

describe("payslipTotals", () => {
  it("adds earnings to the base, takes deductions off, and splits out advance recovery", () => {
    const t = payslipTotals(5000, [line("earning", 500), line("earning", 250.5), line("deduction", 200), line("deduction", 1000, { systemKey: "advance_recovery" })]);
    expect(t).toEqual({ gross: 5750.5, advanceRecovery: 1000, otherDeductions: 200, deductions: 1200, net: 4550.5 });
  });
  it("is just the base with no lines", () => {
    expect(payslipTotals(4000, [])).toEqual({ gross: 4000, advanceRecovery: 0, otherDeductions: 0, deductions: 0, net: 4000 });
  });
  it("does not drift on fils", () => {
    expect(payslipTotals(0.1, [line("earning", 0.2)]).gross).toBe(0.3);
  });
});

describe("suggestRecovery", () => {
  it("asks back the whole balance when it fits inside the pay", () => {
    expect(suggestRecovery(800, 5000)).toBe(800);
  });
  it("caps at the pay left, so a big advance is repaid over months", () => {
    expect(suggestRecovery(9000, 5000)).toBe(5000);
  });
  it("suggests nothing when nothing is owed", () => {
    expect(suggestRecovery(0, 5000)).toBe(0);
    expect(suggestRecovery(-5, 5000)).toBe(0);
  });
});

describe("advanceBalance", () => {
  it("is paid minus recovered", () => {
    expect(advanceBalance(2000, 500)).toBe(1500);
    expect(advanceBalance(1000, 1000)).toBe(0);
  });
});

describe("ledger lines", () => {
  const sum = (ls: { debit?: number; credit?: number }[], k: "debit" | "credit") => ls.reduce((s, l) => s + Math.round((l[k] ?? 0) * 100), 0);

  it("a salary: expense for pay less absence, advance recovered, the rest out of the bank", () => {
    const lines = payslipPostLines({ number: "PSL-2026-0001", employee: "Sara", bankLedgerAccountId: 77, base: 5000, lines: [line("earning", 500), line("deduction", 200, { systemKey: "absence" }), line("deduction", 1000, { systemKey: "advance_recovery" })] });
    expect(lines).toEqual([
      { account: "exp_salaries", debit: 5300, description: "PSL-2026-0001 Sara" },
      { account: "employee_advances", credit: 1000, description: "PSL-2026-0001 Sara" },
      { account: 77, credit: 4300, description: "PSL-2026-0001 Sara" },
    ]);
    expect(sum(lines, "debit")).toBe(sum(lines, "credit"));
  });
  it("leaves out lines that are zero", () => {
    const lines = payslipPostLines({ number: "P", employee: "A", bankLedgerAccountId: 1, base: 3000, lines: [] });
    expect(lines.map((l) => l.account)).toEqual(["exp_salaries", 1]);
  });
  it("an advance moves money out of the bank into Employee advances", () => {
    const lines = advancePostLines({ number: "ADV-2026-0001", employee: "Sara", bankLedgerAccountId: 77, amount: 800 });
    expect(lines).toEqual([
      { account: "employee_advances", debit: 800, description: "ADV-2026-0001 Sara" },
      { account: 77, credit: 800, description: "ADV-2026-0001 Sara" },
    ]);
  });
});
