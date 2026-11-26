import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { adminQuery, createTestOrg } from "./helpers/orgs";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => new Headers({ host: "demo.test" }) }));
const sent = vi.hoisted(() => [] as { to: string; subject: string; lines: string[] }[]);
vi.mock("@/lib/platform-mail", () => ({
  platformMailReady: () => true,
  sendPlatformMail: async (m: { to: string; subject: string; lines: string[] }) => (sent.push(m), true),
}));

const live = !!process.env.DATABASE_URL && !!process.env.TEST_ADMIN_DATABASE_URL;

describe.skipIf(!live)("the billing job (needs the test database)", () => {
  let checkBilling: typeof import("@/lib/billing-job").checkBilling;
  let runAsOrg: typeof import("@/db").runAsOrg;
  let B: typeof import("@/lib/billing");
  const today = "2026-12-01";
  const tag = `ZZBILL${Date.now()}`;
  const orgs: Record<string, number> = {};
  const admins: Record<string, number> = {};
  const org = async (key: string, plan: string, end: string | null) => {
    const id = (await createTestOrg({ name: `${tag} ${key}` }))[0].id;
    await adminQuery(`UPDATE organizations SET plan = $2, ${plan === "paid" ? "paid_until" : "trial_ends_on"} = $3 WHERE id = $1`, [id, plan, end]);
    admins[key] = (
      await adminQuery<{ id: number }>("INSERT INTO users (organization_id, name, email, password_hash, role) VALUES ($1, 'Omar Khan', $2, 'x', 'admin') RETURNING id", [id, `${tag.toLowerCase()}-${key}@bill.test`])
    )[0].id;
    orgs[key] = id;
  };
  const state = async (key: string) =>
    (await adminQuery<{ status: string; paused_reason: string; billing_reminder: string }>("SELECT status, paused_reason, billing_reminder FROM organizations WHERE id = $1", [orgs[key]]))[0];

  beforeAll(async () => {
    process.env.PLATFORM_NOTIFY_EMAIL = "owner@platform.test";
    ({ checkBilling } = await import("@/lib/billing-job"));
    ({ runAsOrg } = await import("@/db"));
    B = await import("@/lib/billing");
    await org("soon", "paid", B.addDays(today, 3));
    await org("late", "paid", B.addDays(today, -2));
    await org("gone", "paid", B.addDays(today, -(B.GRACE_DAYS + 1)));
    await org("open", "trial", null);
  });

  afterAll(() => {
    delete process.env.PLATFORM_NOTIFY_EMAIL;
  });

  it("reminds the admins once, in the bell and by email", async () => {
    expect(await runAsOrg(orgs.soon, () => checkBilling(today))).toBe("reminded");
    expect((await state("soon")).billing_reminder).toBe(`${B.addDays(today, 3)}:3`);
    const mail = sent.filter((m) => m.to.includes("-soon@"));
    expect(mail).toHaveLength(1);
    expect(mail[0].subject).toMatch(/subscription ends on 4 Dec 2026 \(in 3 days\)/);
    const bell = await adminQuery<{ rule: string; priority: string }>("SELECT rule, priority FROM notifications WHERE user_id = $1", [admins.soon]);
    expect(bell).toEqual([{ rule: "billing", priority: "normal" }]);
    // the hourly check repeats nothing
    expect(await runAsOrg(orgs.soon, () => checkBilling(today))).toBeNull();
    expect(sent.filter((m) => m.to.includes("-soon@"))).toHaveLength(1);
  });

  it("tells the admins and the platform once the date has passed, without pausing yet", async () => {
    expect(await runAsOrg(orgs.late, () => checkBilling(today))).toBe("reminded");
    expect(await state("late")).toMatchObject({ status: "active", billing_reminder: `${B.addDays(today, -2)}:overdue` });
    expect(sent.some((m) => m.to.includes("-late@") && /has ended: renew by/.test(m.subject))).toBe(true);
    expect(sent.some((m) => m.to === "owner@platform.test" && /unpaid since/.test(m.subject))).toBe(true);
  });

  it("pauses an organisation unpaid past the grace days, and tells everyone", async () => {
    expect(await runAsOrg(orgs.gone, () => checkBilling(today))).toBe("paused");
    expect(await state("gone")).toMatchObject({ status: "suspended", paused_reason: "unpaid" });
    expect(sent.some((m) => m.to.includes("-gone@") && /is paused/.test(m.subject))).toBe(true);
    expect(sent.some((m) => m.to === "owner@platform.test" && /was paused/.test(m.subject))).toBe(true);
    // a paused organisation is left alone
    expect(await runAsOrg(orgs.gone, () => checkBilling(today))).toBeNull();
  });

  it("leaves an open trial alone", async () => {
    expect(await runAsOrg(orgs.open, () => checkBilling(today))).toBeNull();
    expect(sent.some((m) => m.to.includes("-open@"))).toBe(false);
  });
});
