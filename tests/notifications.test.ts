import "dotenv/config";
import { SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ChatEvent } from "@/lib/chat/types";

let cookieValue: string | undefined;
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => (cookieValue ? { value: cookieValue } : undefined) }) }));
vi.mock("next/navigation", () => ({
  redirect: () => {
    throw new Error("redirect");
  },
  notFound: () => {
    throw new Error("notFound");
  },
}));

const live = !!process.env.DATABASE_URL && !!process.env.AUTH_SECRET;

describe.skipIf(!live)("notifications (needs the dev database)", () => {
  let db: typeof import("@/db").db;
  let schema: typeof import("@/db").schema;
  let D: typeof import("drizzle-orm");
  let crm: typeof import("@/app/(app)/crm/actions");
  let tasks: typeof import("@/app/(app)/tasks/actions");
  let N: typeof import("@/lib/notifications");
  let scan: typeof import("@/lib/notifications/scan");
  let bus: typeof import("@/lib/chat/bus");
  let ali: number, bina: number, boss: number;
  let userIds: number[] = [];
  let companyId: number, dealId: number, taskId: number;
  const tag = `ZZNOTE${Date.now()}`;

  const as = async (id: number, role: "admin" | "sales" = "sales") => {
    cookieValue = await new SignJWT({ name: `${tag}-${id}`, email: `${tag}-${id}@example.test`, role })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(String(id))
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(process.env.AUTH_SECRET));
  };
  const lines = (userId: number, rule?: string) =>
    db
      .select()
      .from(schema.notifications)
      .where(D.and(D.eq(schema.notifications.userId, userId), rule ? D.eq(schema.notifications.rule, rule) : undefined));

  beforeAll(async () => {
    ({ db, schema } = await import("@/db"));
    D = await import("drizzle-orm");
    crm = await import("@/app/(app)/crm/actions");
    tasks = await import("@/app/(app)/tasks/actions");
    N = await import("@/lib/notifications");
    scan = await import("@/lib/notifications/scan");
    bus = await import("@/lib/chat/bus");
    const mk = async (name: string, role: "admin" | "sales" = "sales") =>
      (
        await db
          .insert(schema.users)
          .values({ name: `${tag}-${name}`, email: `${tag}-${name}@example.test`, passwordHash: "x", role, apps: ["crm", "sales", "tasks"] })
          .returning({ id: schema.users.id })
      )[0].id;
    ali = await mk("ali");
    bina = await mk("bina");
    boss = await mk("boss", "admin");
    userIds = [ali, bina, boss];
    const { dubaiToday } = await import("@/lib/dates");
    await db.insert(schema.attendancePunches).values(userIds.map((userId) => ({ userId, day: dubaiToday() })));

    // a Qualified deal that reached the stage 6 days ago with no quote, and a task 4 days overdue
    [{ id: companyId }] = await db.insert(schema.companies).values({ name: `${tag} Trading`, nameNorm: tag.toLowerCase() }).returning({ id: schema.companies.id });
    const sixDaysAgo = new Date(Date.now() - 6 * 86400_000);
    [{ id: dealId }] = await db
      .insert(schema.deals)
      .values({ title: `${tag} cameras`, companyId, stage: "requirement", ownerId: ali, stageChangedAt: sixDaysAgo, createdAt: sixDaysAgo })
      .returning({ id: schema.deals.id });
    await db.insert(schema.dealAssignees).values({ dealId, userId: ali, position: 0 });
    const { shiftDay } = await import("@/lib/notifications/work-time");
    [{ id: taskId }] = await db
      .insert(schema.tasks)
      .values({ title: `${tag} call back`, dueDate: shiftDay(dubaiToday(), -4), assignedTo: ali, createdBy: ali, relatedType: "deal", relatedId: dealId })
      .returning({ id: schema.tasks.id });
  });

  afterAll(async () => {
    await db.delete(schema.tasks).where(D.inArray(schema.tasks.assignedTo, userIds));
    if (companyId) await db.delete(schema.companies).where(D.eq(schema.companies.id, companyId));
    await db.delete(schema.attendancePunches).where(D.inArray(schema.attendancePunches.userId, userIds));
    await db.delete(schema.users).where(D.inArray(schema.users.id, userIds));
    await bus.closeBus();
  });

  it("tells only the people newly put on a deal, never the admin who did it", async () => {
    await as(boss, "admin");
    await crm.setAssignees(dealId, [ali, bina]);
    expect(await lines(bina, "deal_assigned")).toHaveLength(1);
    expect(await lines(ali, "deal_assigned")).toHaveLength(0); // already on it
    expect(await lines(boss, "deal_assigned")).toHaveLength(0);
    const [n] = await lines(bina, "deal_assigned");
    expect(n.priority).toBe("high");
    expect(n.link).toBe(`/crm/deals/${dealId}`);

    // taken off the deal: the line is resolved
    await crm.setAssignees(dealId, [ali]);
    expect((await lines(bina, "deal_assigned"))[0].resolvedAt).not.toBeNull();
  });

  it("tells someone given a task by an admin", async () => {
    await as(boss, "admin");
    await tasks.createTask({ title: `${tag} send datasheet`, assignedTo: bina, priority: "high" });
    const [n] = await lines(bina, "task_assigned");
    expect(n.title).toContain("send datasheet");
    expect(n.priority).toBe("high");
  });

  it("raises each rule step once and resolves it when the work is done", async () => {
    await scan.runScan();
    const quote = await lines(ali, "deal_no_quote");
    expect(quote).toHaveLength(1);
    expect(quote[0].dedupeKey).toBe(`deal_no_quote:deal:${dealId}:late`);
    expect(quote[0].priority).toBe("critical");
    const task = await lines(ali, "task_overdue");
    expect(task.map((t) => t.dedupeKey)).toEqual([`task_overdue:task:${taskId}:late`]);

    // a second run adds nothing
    await scan.runScan();
    expect(await lines(ali, "deal_no_quote")).toHaveLength(1);
    expect(await lines(ali, "task_overdue")).toHaveLength(1);

    // the task is done: its alert is resolved; the deal moves on: so is the quote alert
    await as(ali);
    await tasks.setTaskDone(taskId, true);
    await db.update(schema.deals).set({ stage: "lost", lostReason: "test" }).where(D.eq(schema.deals.id, dealId));
    await scan.runScan();
    expect((await lines(ali, "task_overdue"))[0].resolvedAt).not.toBeNull();
    expect((await lines(ali, "deal_no_quote"))[0].resolvedAt).not.toBeNull();
    const bell = await N.bellFor(ali);
    expect(bell.items.some((i) => i.rule === "task_overdue" || i.rule === "deal_no_quote")).toBe(false);
  });

  it("marks read and snoozes only my own lines", async () => {
    const before = await N.bellFor(bina);
    expect(before.unread).toBeGreaterThan(0);
    const id = before.items[0].id;
    await N.markRead(ali, [id]); // not Ali's line
    expect((await N.bellFor(bina)).unread).toBe(before.unread);
    await N.snooze(bina, id, new Date(Date.now() + 3600_000));
    expect((await N.bellFor(bina)).items.some((i) => i.id === id)).toBe(false);
    await N.markRead(bina);
    expect((await N.bellFor(bina)).unread).toBe(0);
  });

  it("gives admins a team summary of open critical alerts (no emails without a digest mailbox)", async () => {
    const { getSetting } = await import("@/lib/settings");
    if (await getSetting("notify_digest_from")) return; // a real mailbox is set: never email from a test
    await N.notify({ userIds: [ali], kind: "system", rule: "test", priority: "critical", title: `${tag} burning`, link: "/", key: `test-crit:${tag}` });
    const { sendDigests } = await import("@/lib/notifications/digest");
    const day = `test-${tag}`;
    const r = await sendDigests(day);
    expect(r.emails).toBe(0);
    const [line] = await lines(boss, "team_summary");
    expect(line.title).toMatch(/^Team summary: \d+ critical/);
    expect(line.link).toBe("/notifications?view=team");
    // other admins on the dev database got the same test line: remove it
    await db.delete(schema.notifications).where(D.eq(schema.notifications.dedupeKey, `team_summary:${day}`));
  });

  it("pushes a new line to the person's open portal tabs", async () => {
    const got: ChatEvent[] = [];
    const off = bus.subscribe(bina, (e) => {
      if (e.t !== "resync") got.push(e);
    });
    await new Promise((r) => setTimeout(r, 600)); // LISTEN connects
    await N.notify({ userIds: [bina], kind: "assign", rule: "test", priority: "normal", title: `${tag} ping`, link: "/", key: `test:${tag}` });
    await new Promise((r) => setTimeout(r, 600));
    off();
    expect(got.some((e) => e.t === "notification" && e.n.title === `${tag} ping`)).toBe(true);
  });
});
