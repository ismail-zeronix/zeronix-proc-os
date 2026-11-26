import { describe, expect, it } from "vitest";
import { addMonths, billingState, extendPaidUntil, GRACE_DAYS, reminderFor, shouldPause, type BillingFields } from "@/lib/billing";

const trial = (trialEndsOn: string | null): BillingFields => ({ plan: "trial", trialEndsOn, paidUntil: null });
const paid = (paidUntil: string | null): BillingFields => ({ plan: "paid", trialEndsOn: "2026-11-01", paidUntil });

describe("billing state", () => {
  it("free and open-ended plans never end", () => {
    expect(billingState({ plan: "free", trialEndsOn: "2020-01-01", paidUntil: null }, "2026-12-01")).toMatchObject({ endsOn: null, tone: "ok", label: "Free, no end date" });
    expect(billingState(trial(null), "2026-12-01")).toMatchObject({ endsOn: null, daysLeft: null, label: "Trial, no end date" });
    expect(shouldPause(billingState(trial(null), "2030-01-01"))).toBe(false);
  });

  it("counts down to the end, warns in the last week, then pauses after the grace days", () => {
    expect(billingState(trial("2026-12-10"), "2026-11-26")).toMatchObject({ daysLeft: 14, tone: "ok", label: "Trial ends 10 Dec 2026 (14 days)" });
    expect(billingState(trial("2026-12-10"), "2026-12-03")).toMatchObject({ daysLeft: 7, tone: "warn" });
    expect(billingState(paid("2026-12-10"), "2026-12-10")).toMatchObject({ daysLeft: 0, tone: "warn", label: "Paid until 10 Dec 2026 (today)" });
    const late = billingState(paid("2026-12-10"), "2026-12-12");
    expect(late).toMatchObject({ overdueDays: 2, tone: "bad", pauseOn: "2026-12-18", label: "Unpaid since 10 Dec 2026, pauses 18 Dec 2026" });
    expect(shouldPause(late)).toBe(false);
    expect(shouldPause(billingState(paid("2026-12-10"), `2026-12-${10 + GRACE_DAYS}`))).toBe(false);
    expect(shouldPause(billingState(paid("2026-12-10"), "2026-12-18"))).toBe(true);
  });
});

describe("reminders", () => {
  const at = (today: string, last = "") => reminderFor(billingState(paid("2026-12-10"), today), last);

  it("go at 7, 3 and 1 days left and once after the date, each once", () => {
    expect(at("2026-12-01")).toBeNull();
    expect(at("2026-12-03")).toEqual({ key: "2026-12-10:7", kind: "soon" });
    expect(at("2026-12-04", "2026-12-10:7")).toBeNull();
    expect(at("2026-12-07", "2026-12-10:7")).toEqual({ key: "2026-12-10:3", kind: "soon" });
    expect(at("2026-12-09", "2026-12-10:3")).toEqual({ key: "2026-12-10:1", kind: "soon" });
    expect(at("2026-12-10", "2026-12-10:1")).toBeNull();
    expect(at("2026-12-11", "2026-12-10:1")).toEqual({ key: "2026-12-10:overdue", kind: "overdue" });
    expect(at("2026-12-15", "2026-12-10:overdue")).toBeNull();
  });

  it("catch up after a day the server was down, without going backwards", () => {
    // nothing sent at 7 days (down): with 2 days left the 3-day reminder goes
    expect(at("2026-12-08")).toEqual({ key: "2026-12-10:3", kind: "soon" });
    expect(at("2026-12-08", "2026-12-10:1")).toBeNull();
  });

  it("start again for a new end date", () => {
    expect(reminderFor(billingState(paid("2027-01-10"), "2027-01-03"), "2026-12-10:overdue")).toEqual({ key: "2027-01-10:7", kind: "soon" });
  });
});

describe("payments", () => {
  it("add whole months, keeping the last day of short months", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonths("2026-11-15", 12)).toBe("2027-11-15");
    expect(addMonths("2026-12-31", 2)).toBe("2027-02-28");
  });

  it("count from the later of the current end and today, keeping trial days left", () => {
    expect(extendPaidUntil(trial("2026-12-10"), "2026-11-26", 1)).toBe("2027-01-10");
    expect(extendPaidUntil(trial(null), "2026-11-26", 1)).toBe("2026-12-26");
    expect(extendPaidUntil(paid("2026-12-10"), "2026-12-01", 12)).toBe("2027-12-10");
    // paid late: from today, not from the old date
    expect(extendPaidUntil(paid("2026-12-10"), "2026-12-20", 1)).toBe("2027-01-20");
  });
});
