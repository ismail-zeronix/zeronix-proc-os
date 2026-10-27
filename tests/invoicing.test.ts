import { describe, expect, it } from "vitest";
import { ageBucket, buildStatement, checkPaymentAmount, daysBetween, dueDateFor, invoiceNumber, invoiceState, termsLabel, yearNumber } from "@/lib/invoicing";

describe("document numbers", () => {
  it("numbers per year with four digits", () => {
    expect(yearNumber("ZSO", 2026, 1)).toBe("ZSO-2026-0001");
    expect(yearNumber("ZRV", 2026, 12345)).toBe("ZRV-2026-12345");
  });
  it("continues an invoice series with the admin prefix and padding", () => {
    expect(invoiceNumber("INV-", 124, 5)).toBe("INV-00124");
    expect(invoiceNumber("INV-", 124, 6)).toBe("INV-000124");
    expect(invoiceNumber("ZX/", 7, 0)).toBe("ZX/7");
  });
});

describe("credit terms and due dates", () => {
  it("adds the credit days to the invoice date", () => {
    expect(dueDateFor("2026-10-21", 30)).toBe("2026-11-20");
    expect(dueDateFor("2026-12-20", 15)).toBe("2027-01-04");
    expect(dueDateFor("2026-10-21", 0)).toBe("2026-10-21");
    expect(termsLabel(0)).toBe("Cash / on delivery");
    expect(termsLabel(7)).toBe("7 days credit");
    expect(daysBetween("2026-10-21", "2026-10-31")).toBe(10);
  });
});

describe("invoice state", () => {
  const inv = { status: "issued", total: 1050, dueDate: "2026-10-31" };
  it("is due, part paid, paid", () => {
    expect(invoiceState(inv, 0, "2026-10-21")).toMatchObject({ key: "unpaid", balance: 1050, label: "Due in 10 days" });
    expect(invoiceState(inv, 0, "2026-10-31").label).toBe("Due today");
    expect(invoiceState(inv, 500, "2026-10-21")).toMatchObject({ key: "part", balance: 550 });
    expect(invoiceState(inv, 1050, "2026-12-01")).toMatchObject({ key: "paid", balance: 0, daysOverdue: 0 });
  });
  it("is overdue after the due date, also when part paid", () => {
    expect(invoiceState(inv, 0, "2026-11-01")).toMatchObject({ key: "overdue", daysOverdue: 1, label: "Overdue 1 day" });
    expect(invoiceState(inv, 50, "2026-11-15")).toMatchObject({ key: "overdue", daysOverdue: 15, balance: 1000, label: "Part paid, overdue 15 days" });
  });
  it("owes nothing once cancelled", () => {
    expect(invoiceState({ ...inv, status: "cancelled" }, 0, "2026-12-01")).toMatchObject({ key: "cancelled", balance: 0 });
  });
  it("puts late amounts in age buckets", () => {
    expect([0, 1, 30, 31, 60, 61, 90, 91].map(ageBucket)).toEqual(["current", "d30", "d30", "d60", "d60", "d90", "d90", "d90plus"]);
  });
});

describe("payments", () => {
  it("must be above zero and not more than what is owed", () => {
    expect(checkPaymentAmount(0, 100)).toMatch(/above zero/);
    expect(checkPaymentAmount(100.01, 100)).toMatch(/more than/);
    expect(checkPaymentAmount(100, 100)).toBeNull();
    expect(checkPaymentAmount(0.1 + 0.2, 0.3)).toBeNull();
  });
});

describe("statement of account", () => {
  it("runs the balance in date order, invoices before payments on the same day", () => {
    const { lines, closing } = buildStatement(
      [
        { date: "2026-10-05", kind: "payment", number: "ZRV-2026-0001", amount: 400 },
        { date: "2026-10-05", kind: "invoice", number: "INV-00002", amount: 1000 },
        { date: "2026-10-01", kind: "invoice", number: "INV-00001", amount: 500 },
        { date: "2026-10-09", kind: "credit", number: "ZCN-2026-0001", amount: 500 },
      ],
      100,
    );
    expect(lines.map((l) => [l.number, l.balance])).toEqual([
      ["INV-00001", 600],
      ["INV-00002", 1600],
      ["ZRV-2026-0001", 1200],
      ["ZCN-2026-0001", 700],
    ]);
    expect(closing).toBe(700);
  });
});

describe("amount in words", async () => {
  const { aedInWords } = await import("@/lib/words");
  it("writes dirhams and fils", () => {
    expect(aedInWords(2625.5)).toBe("UAE Dirhams Two Thousand Six Hundred Twenty-Five and Fifty Fils Only");
    expect(aedInWords(1000000)).toBe("UAE Dirhams One Million Only");
    expect(aedInWords(0.05)).toBe("UAE Dirhams Zero and Five Fils Only");
    expect(aedInWords(115)).toBe("UAE Dirhams One Hundred Fifteen Only");
    expect(aedInWords(1234567.89)).toBe("UAE Dirhams One Million Two Hundred Thirty-Four Thousand Five Hundred Sixty-Seven and Eighty-Nine Fils Only");
  });
});
