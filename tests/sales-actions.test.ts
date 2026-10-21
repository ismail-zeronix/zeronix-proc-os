import "dotenv/config";
import { SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// The actions read the session cookie and ask Next to refresh pages. Here the cookie is ours to set, and refreshing is a no-op.
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

describe.skipIf(!live)("sales actions (needs the dev database)", () => {
  let db: typeof import("@/db").db;
  let schema: typeof import("@/db").schema;
  let pool: typeof import("@/db").pool;
  let eq: typeof import("drizzle-orm").eq;
  let inArray: typeof import("drizzle-orm").inArray;
  let A: typeof import("@/app/(app)/sales/actions");
  let T: typeof import("@/app/(app)/tasks/actions");
  let userIds: number[] = [];
  let seller: number, colleague: number, outsider: number, boss: number;
  const tag = `ZZTEST${Date.now()}`;

  const sign = (id: number, name: string, role: "admin" | "sales") =>
    new SignJWT({ name, email: `${name}@example.test`, role })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(String(id))
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(process.env.AUTH_SECRET));
  const as = async (id: number, name: string, role: "admin" | "sales" = "sales") => {
    cookieValue = await sign(id, name, role);
  };

  beforeAll(async () => {
    ({ db, schema, pool } = await import("@/db"));
    ({ eq, inArray } = await import("drizzle-orm"));
    A = await import("@/app/(app)/sales/actions");
    T = await import("@/app/(app)/tasks/actions");
    const mk = async (name: string, role: "admin" | "sales", apps: string[] | null) =>
      (await db.insert(schema.users).values({ name: `${tag}-${name}`, email: `${tag}-${name}@example.test`, passwordHash: "x", role, apps }).returning({ id: schema.users.id }))[0].id;
    seller = await mk("seller", "sales", null);
    colleague = await mk("colleague", "sales", null);
    outsider = await mk("outsider", "sales", ["procurement", "tasks"]); // no Sales app
    boss = await mk("boss", "admin", null);
    userIds = [seller, colleague, outsider, boss];
  });

  afterAll(async () => {
    const cs = await db.select({ id: schema.companies.id }).from(schema.companies).where(inArray(schema.companies.ownerId, userIds));
    const names = await db.select({ id: schema.companies.id, name: schema.companies.name }).from(schema.companies);
    const ids = [...new Set([...cs.map((c) => c.id), ...names.filter((n) => n.name.includes(tag)).map((n) => n.id)])];
    if (ids.length) {
      const deals = await db.select({ id: schema.deals.id }).from(schema.deals).where(inArray(schema.deals.companyId, ids));
      if (deals.length) await db.delete(schema.tasks).where(inArray(schema.tasks.relatedId, deals.map((d) => d.id)));
      await db.delete(schema.companies).where(inArray(schema.companies.id, ids));
    }
    await db.delete(schema.tasks).where(inArray(schema.tasks.createdBy, userIds));
    await db.delete(schema.users).where(inArray(schema.users.id, userIds));
    await pool.end();
  });

  it("creates the company, person, deal, first log entry and a follow-up task in one go", async () => {
    await as(seller, "seller");
    const res = await A.createEnquiry({
      companyName: `${tag} Alpha Trading LLC`,
      emirate: "Dubai",
      contactName: "Ahmed Khan",
      contactPhone: "+971500000001",
      contactEmail: "ahmed@alpha.test",
      source: "Phone call",
      requirement: "20 laptops i5 16GB\nneeded by month end",
      valueAed: 60000,
    });
    expect(res.reusedCompany).toBeNull();
    const [deal] = await db.select().from(schema.deals).where(eq(schema.deals.id, res.id));
    expect(deal.stage).toBe("new");
    expect(deal.ownerId).toBe(seller);
    expect(deal.valueAed).toBe(60000);
    expect(deal.title).toContain("Alpha Trading");
    const acts = await db.select().from(schema.activities).where(eq(schema.activities.dealId, res.id));
    expect(acts.map((a) => a.type)).toEqual(["created"]);
    const tasks = await db.select().from(schema.tasks).where(eq(schema.tasks.relatedId, res.id));
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ relatedType: "deal", assignedTo: seller, status: "open", priority: "high" });
    const [contact] = await db.select().from(schema.contacts).where(eq(schema.contacts.id, deal.contactId!));
    expect(contact.email).toBe("ahmed@alpha.test");
  });

  it("reuses an existing company when the name is the same apart from spelling", async () => {
    await as(seller, "seller");
    const res = await A.createEnquiry({ companyName: `${tag} ALPHA trading l.l.c.`, requirement: "servers" });
    expect(res.reusedCompany).toContain("Alpha Trading");
    const rows = await db.select().from(schema.companies).where(eq(schema.companies.nameNorm, (await import("@/lib/sales")).normName(`${tag} Alpha Trading`)));
    expect(rows).toHaveLength(1);
  });

  it("asks for a company", async () => {
    await as(seller, "seller");
    await expect(A.createEnquiry({ requirement: "x" })).rejects.toThrow(/company/i);
  });

  it("moves a brand-new deal to Contacted when a call is logged, and books the follow-up", async () => {
    await as(seller, "seller");
    const { id } = await A.createEnquiry({ companyName: `${tag} Beta`, contactName: "Sara", requirement: "monitors" });
    await A.logActivity(id, { type: "call", body: "Spoke to Sara, needs 10 monitors", followUp: "2030-01-15" });
    const [deal] = await db.select().from(schema.deals).where(eq(schema.deals.id, id));
    expect(deal.stage).toBe("contacted");
    const acts = await db.select().from(schema.activities).where(eq(schema.activities.dealId, id));
    expect(acts.map((a) => a.type).sort()).toEqual(["call", "created", "stage"]);
    const tasks = await db.select().from(schema.tasks).where(eq(schema.tasks.relatedId, id));
    expect(tasks.some((t) => t.dueDate === "2030-01-15" && t.title.startsWith("Follow up"))).toBe(true);
    // a note does not count as contacting the customer
    const { id: id2 } = await A.createEnquiry({ companyName: `${tag} Gamma`, requirement: "x" });
    await A.logActivity(id2, { type: "note", body: "internal note" });
    const [d2] = await db.select().from(schema.deals).where(eq(schema.deals.id, id2));
    expect(d2.stage).toBe("new");
  });

  it("needs a reason to mark a deal lost, records closing, and clears it when reopened", async () => {
    await as(seller, "seller");
    const { id } = await A.createEnquiry({ companyName: `${tag} Delta`, requirement: "x" });
    await expect(A.moveDeal(id, "lost")).rejects.toThrow(/reason/i);
    await expect(A.moveDeal(id, "nonsense")).rejects.toThrow(/stage/i);
    await A.moveDeal(id, "lost", "Price too high");
    let [d] = await db.select().from(schema.deals).where(eq(schema.deals.id, id));
    expect(d).toMatchObject({ stage: "lost", lostReason: "Price too high" });
    expect(d.closedAt).not.toBeNull();
    await A.moveDeal(id, "negotiation");
    [d] = await db.select().from(schema.deals).where(eq(schema.deals.id, id));
    expect(d).toMatchObject({ stage: "negotiation", lostReason: "" });
    expect(d.closedAt).toBeNull();
    await A.moveDeal(id, "won");
    [d] = await db.select().from(schema.deals).where(eq(schema.deals.id, id));
    expect(d.stage).toBe("won");
    expect(d.closedAt).not.toBeNull();
    const stageLogs = (await db.select().from(schema.activities).where(eq(schema.activities.dealId, id))).filter((a) => a.type === "stage");
    expect(stageLogs).toHaveLength(3);
    expect(stageLogs.some((a) => a.body.includes("Price too high"))).toBe(true);
  });

  it("keeps only the known checklist items", async () => {
    await as(seller, "seller");
    const { id } = await A.createEnquiry({ companyName: `${tag} Epsilon`, requirement: "x" });
    await A.setChecks(id, { need: true, trn: true, hacker: true, budget: false } as Record<string, boolean>);
    const [d] = await db.select().from(schema.deals).where(eq(schema.deals.id, id));
    expect(d.checks).toEqual({ need: true, trn: true });
  });

  it("does not allow the same company twice, even with different punctuation", async () => {
    await as(seller, "seller");
    const id = await A.createCompany({ name: `${tag} Zeta Contracting` });
    await expect(A.createCompany({ name: `${tag} zeta contracting llc` })).rejects.toThrow(/already/i);
    const other = await A.createCompany({ name: `${tag} Eta Contracting` });
    await expect(A.updateCompany(other, { name: `${tag} Zeta Contracting` })).rejects.toThrow(/already exists/i);
    await A.updateCompany(id, { name: `${tag} Zeta Contracting`, emirate: "Sharjah" }); // saving itself is fine
  });

  it("rejects a bad email on a contact", async () => {
    await as(seller, "seller");
    const cid = await A.createCompany({ name: `${tag} Theta` });
    await expect(A.createContact(cid, { name: "Bad", email: "not-an-email" })).rejects.toThrow(/email/i);
    await A.createContact(cid, { name: "Good", email: "good@theta.test", isDecisionMaker: true });
  });

  it("blocks everything for a user without the Sales app", async () => {
    await as(outsider, "outsider");
    await expect(A.createEnquiry({ companyName: `${tag} Nope`, requirement: "x" })).rejects.toThrow(/access/i);
    await expect(A.createCompany({ name: `${tag} Nope2` })).rejects.toThrow(/access/i);
    await expect(A.moveDeal(1, "won")).rejects.toThrow(/access/i);
    await expect(T.createTask({ title: "x", related: { type: "deal", id: 1 } })).rejects.toThrow(/access/i);
  });

  it("lets only the owner or an admin delete a deal, and removes its tasks", async () => {
    await as(seller, "seller");
    const { id } = await A.createEnquiry({ companyName: `${tag} Iota`, requirement: "x" });
    await as(colleague, "colleague");
    await expect(A.deleteDeal(id)).rejects.toThrow(/people on the deal or an admin/);
    await as(seller, "seller");
    await A.deleteDeal(id);
    expect(await db.select().from(schema.deals).where(eq(schema.deals.id, id))).toHaveLength(0);
    expect(await db.select().from(schema.tasks).where(eq(schema.tasks.relatedId, id))).toHaveLength(0);
  });

  it("lets only an admin delete a company", async () => {
    await as(seller, "seller");
    const cid = await A.createCompany({ name: `${tag} Kappa` });
    await expect(A.deleteCompany(cid)).rejects.toThrow(/admin/i);
    await as(boss, "boss", "admin");
    await A.deleteCompany(cid);
    expect(await db.select().from(schema.companies).where(eq(schema.companies.id, cid))).toHaveLength(0);
  });

  it("can give a deal to several people, main owner first, and only people who can open Sales", async () => {
    await as(seller, "seller");
    const { id } = await A.createEnquiry({ companyName: `${tag} Mu`, requirement: "x", ownerIds: [colleague, seller] });
    let rows = await db.select().from(schema.dealAssignees).where(eq(schema.dealAssignees.dealId, id));
    expect(rows.sort((a, b) => a.position - b.position).map((r) => r.userId)).toEqual([colleague, seller]);
    let [d] = await db.select().from(schema.deals).where(eq(schema.deals.id, id));
    expect(d.ownerId).toBe(colleague);
    // the follow-up task goes to the main owner
    const task = (await db.select().from(schema.tasks).where(eq(schema.tasks.relatedId, id)))[0];
    expect(task.assignedTo).toBe(colleague);

    await A.setAssignees(id, [boss, seller, colleague]);
    rows = await db.select().from(schema.dealAssignees).where(eq(schema.dealAssignees.dealId, id));
    expect(rows.sort((a, b) => a.position - b.position).map((r) => r.userId)).toEqual([boss, seller, colleague]);
    [d] = await db.select().from(schema.deals).where(eq(schema.deals.id, id));
    expect(d.ownerId).toBe(boss);
    const note = (await db.select().from(schema.activities).where(eq(schema.activities.dealId, id))).find((a) => a.body.startsWith("Assigned to"));
    expect(note?.body).toContain("seller");

    await expect(A.setAssignees(id, [outsider])).rejects.toThrow(/cannot work on Sales/);
    await expect(A.createEnquiry({ companyName: `${tag} Nu`, requirement: "x", ownerIds: [outsider] })).rejects.toThrow(/cannot work on Sales/);

    await A.setAssignees(id, []);
    [d] = await db.select().from(schema.deals).where(eq(schema.deals.id, id));
    expect(d.ownerId).toBeNull();
    expect(await db.select().from(schema.dealAssignees).where(eq(schema.dealAssignees.dealId, id))).toHaveLength(0);
  });

  it("lists deals for everyone assigned, not only the main owner", async () => {
    await as(seller, "seller");
    const { listDeals } = await import("@/lib/sales-data");
    const { id } = await A.createEnquiry({ companyName: `${tag} Xi`, requirement: "x", ownerIds: [colleague, seller] });
    expect((await listDeals({ memberId: seller })).some((d) => d.id === id)).toBe(true);
    expect((await listDeals({ memberId: colleague })).some((d) => d.id === id)).toBe(true);
    expect((await listDeals({ memberId: boss })).some((d) => d.id === id)).toBe(false);
    const row = (await listDeals({ memberId: seller })).find((d) => d.id === id)!;
    expect(row.assignees.map((a) => a.id)).toEqual([colleague, seller]);
  });

  it("starts a deal at the column's stage (and skips the contact-them-today task)", async () => {
    await as(seller, "seller");
    const { id } = await A.createEnquiry({ companyName: `${tag} Omicron`, requirement: "x", stage: "sourcing" });
    const [d] = await db.select().from(schema.deals).where(eq(schema.deals.id, id));
    expect(d.stage).toBe("sourcing");
    expect(await db.select().from(schema.tasks).where(eq(schema.tasks.relatedId, id))).toHaveLength(0);
    const log = (await db.select().from(schema.activities).where(eq(schema.activities.dealId, id)))[0];
    expect(log.body).toContain("Sourcing");
    // a closed stage cannot be a starting stage
    const { id: id2 } = await A.createEnquiry({ companyName: `${tag} Pi`, requirement: "x", stage: "won" });
    const [d2] = await db.select().from(schema.deals).where(eq(schema.deals.id, id2));
    expect(d2.stage).toBe("new");
  });

  it("lets anyone on the deal delete it", async () => {
    await as(seller, "seller");
    const { id } = await A.createEnquiry({ companyName: `${tag} Rho`, requirement: "x", ownerIds: [seller, colleague] });
    await as(colleague, "colleague");
    await A.deleteDeal(id);
    expect(await db.select().from(schema.deals).where(eq(schema.deals.id, id))).toHaveLength(0);
  });

  it("attaches a follow-up task to a deal from the Tasks app", async () => {
    await as(seller, "seller");
    const { id } = await A.createEnquiry({ companyName: `${tag} Lambda`, requirement: "x" });
    await T.createTask({ title: "Send brochure", dueDate: "2030-02-01", related: { type: "deal", id } });
    const rows = await db.select().from(schema.tasks).where(eq(schema.tasks.relatedId, id));
    expect(rows.map((t) => t.title).sort()).toContain("Send brochure");
    await expect(T.createTask({ title: "ghost", related: { type: "deal", id: 99999999 } })).rejects.toThrow(/no longer exists/);
  });
});
