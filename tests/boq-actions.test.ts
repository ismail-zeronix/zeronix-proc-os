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

describe.skipIf(!live)("project BOQ (needs the dev database)", () => {
  let db: typeof import("@/db").db;
  let schema: typeof import("@/db").schema;
  let pool: typeof import("@/db").pool;
  let eq: typeof import("drizzle-orm").eq;
  let asc: typeof import("drizzle-orm").asc;
  let inArray: typeof import("drizzle-orm").inArray;
  let and: typeof import("drizzle-orm").and;
  let S: typeof import("@/app/(app)/sales/actions");
  let Q: typeof import("@/app/(app)/sales/quote-actions");
  let B: typeof import("@/app/(app)/projects/boq-actions");
  let D: typeof import("@/lib/projects-data");
  let userIds: number[] = [];
  let seller: number, other: number, projectsOnly: number;
  const tag = `ZZBOQ${Date.now()}`;

  const as = async (id: number, name: string) => {
    cookieValue = await new SignJWT({ name, email: `${name}@example.test`, role: "sales" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(String(id))
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(process.env.AUTH_SECRET));
  };
  const line = (over: Partial<import("@/app/(app)/projects/boq-actions").BoqLineInput> = {}) => ({
    section: "Cameras & recording",
    description: "Dome camera 4MP",
    lineType: "material",
    unit: "nos",
    qty: 1,
    costAed: null,
    unitPriceAed: 100,
    optional: false,
    ...over,
  });

  beforeAll(async () => {
    ({ db, schema, pool } = await import("@/db"));
    ({ eq, asc, inArray, and } = await import("drizzle-orm"));
    S = await import("@/app/(app)/sales/actions");
    Q = await import("@/app/(app)/sales/quote-actions");
    B = await import("@/app/(app)/projects/boq-actions");
    D = await import("@/lib/projects-data");
    const mk = async (name: string, apps: string[] | null) =>
      (await db.insert(schema.users).values({ name: `${tag}-${name}`, email: `${tag}-${name}@example.test`, passwordHash: "x", role: "sales", apps }).returning({ id: schema.users.id }))[0].id;
    seller = await mk("seller", null);
    other = await mk("other", null);
    projectsOnly = await mk("projects-only", ["projects"]);
    userIds = [seller, other, projectsOnly];
    const { dubaiToday } = await import("@/lib/dates");
    await db.insert(schema.attendancePunches).values(userIds.map((userId) => ({ userId, day: dubaiToday() })));
  });

  afterAll(async () => {
    const cs = await db.select({ id: schema.companies.id, name: schema.companies.name }).from(schema.companies);
    const ids = cs.filter((c) => c.name.includes(tag)).map((c) => c.id);
    if (ids.length) {
      const deals = await db.select({ id: schema.deals.id }).from(schema.deals).where(inArray(schema.deals.companyId, ids));
      if (deals.length) {
        await db.delete(schema.tasks).where(and(eq(schema.tasks.relatedType, "deal"), inArray(schema.tasks.relatedId, deals.map((d) => d.id))));
        await db.delete(schema.quotes).where(inArray(schema.quotes.dealId, deals.map((d) => d.id)));
      }
      await db.delete(schema.companies).where(inArray(schema.companies.id, ids));
    }
    await db.delete(schema.tasks).where(inArray(schema.tasks.createdBy, userIds));
    await db.delete(schema.attendancePunches).where(inArray(schema.attendancePunches.userId, userIds));
    await db.delete(schema.users).where(inArray(schema.users.id, userIds));
    await pool.end();
  });

  let projectId: number, dealId: number;

  it("a new CCTV project starts with the CCTV sections", async () => {
    await as(seller, "seller");
    const r = await S.createEnquiry({ companyName: `${tag} Villa`, requirement: "CCTV, network, alarm", kind: "project", projectType: "cctv" });
    projectId = r.projectId!;
    dealId = r.id;
    const p = await D.getProject(projectId, { id: seller, seesAll: false });
    expect(p?.boqSections).toEqual(["Cameras & recording", "Cabling & accessories", "Installation", "Testing & commissioning"]);
  });

  it("changing the type swaps the sections only while the BOQ is empty", async () => {
    await as(seller, "seller");
    await S.setDealKind(dealId, "project", "networking");
    expect((await D.getProject(projectId, { id: seller, seesAll: false }))?.boqSections[0]).toBe("Network equipment");
    await S.setDealKind(dealId, "project", "cctv");
    await B.addBoqLine(projectId, line());
    await S.setDealKind(dealId, "project", "av");
    expect((await D.getProject(projectId, { id: seller, seesAll: false }))?.boqSections[0]).toBe("Cameras & recording");
    await S.setDealKind(dealId, "project", "cctv");
  });

  it("builds a BOQ in sections, with a new section, labour and an optional extra", async () => {
    await as(seller, "seller");
    await B.addBoqSection(projectId, "  Alarm   system ");
    await expect(B.addBoqSection(projectId, "alarm system")).rejects.toThrow(/already/);
    await B.addBoqLine(projectId, line({ description: "Cat6 cable", section: "Cabling & accessories", unit: "m", qty: 300, costAed: 2, unitPriceAed: 3 }));
    await B.addBoqLine(projectId, line({ description: "Installation team", section: "Installation", lineType: "labour", unit: "day", qty: 2, costAed: 600, unitPriceAed: 900 }));
    await B.addBoqLine(projectId, line({ description: "Alarm panel", section: "Alarm system", unit: "set", unitPriceAed: 1200 }));
    await B.addBoqLine(projectId, line({ description: "Extra camera for gate", optional: true, unitPriceAed: 450 }));
    await expect(B.addBoqLine(projectId, line({ unit: "bucket" }))).rejects.toThrow(/unit/i);
    const p = await D.getProject(projectId, { id: seller, seesAll: false });
    expect(p?.boqSections.at(-1)).toBe("Alarm system");
    expect(await D.boqLines(dealId)).toHaveLength(5);
  });

  it("puts one margin on a whole section, skipping lines without a cost", async () => {
    await as(seller, "seller");
    await B.addBoqLine(projectId, line({ description: "NVR 8 channel", costAed: 500, unitPriceAed: 600 }));
    const r = await B.applySectionMargin(projectId, "Cameras & recording", 20);
    expect(r).toEqual({ changed: 1, skipped: 2 });
    const nvr = (await D.boqLines(dealId)).find((l) => l.description === "NVR 8 channel");
    expect(nvr?.unitPriceAed).toBe(600);
    expect(nvr?.marginPct).toBe(20);
  });

  it("prices to the fil and keeps the margin as typed; a bad margin says so in words", async () => {
    await as(seller, "seller");
    await B.addBoqLine(projectId, line({ description: "Bullet camera 8MP", costAed: 185, marginPct: 10, unitPriceAed: 203.5 }));
    await B.addBoqLine(projectId, line({ description: "RJ45 connector", section: "Alarm system", qty: 200, costAed: 1.35, marginPct: 25, unitPriceAed: 1.69 }));
    const lines = await D.boqLines(dealId);
    expect(lines.find((l) => l.description === "Bullet camera 8MP")).toMatchObject({ unitPriceAed: 203.5, marginPct: 10 });
    // 1.35 + 25% is 1.6875, shown as 1.69: the 25% typed stays, not 25.2
    expect(lines.find((l) => l.description === "RJ45 connector")).toMatchObject({ unitPriceAed: 1.69, marginPct: 25 });
    await B.applySectionMargin(projectId, "Alarm system", 20);
    expect((await D.boqLines(dealId)).find((l) => l.description === "RJ45 connector")).toMatchObject({ unitPriceAed: 1.62, marginPct: 20 });
    await expect(B.applySectionMargin(projectId, "Alarm system", 1020)).rejects.toThrow("The margin can be at most 300%");
    for (const l of (await D.boqLines(dealId)).filter((x) => x.description === "Bullet camera 8MP" || x.description === "RJ45 connector")) await B.deleteBoqLine(l.id);
  });

  it("makes a quote in section order, with units, without optional extras", async () => {
    // someone with only the Projects app can make the quote from the BOQ
    await db.insert(schema.dealAssignees).values({ dealId, userId: projectsOnly, position: 5 });
    await as(projectsOnly, "projects-only");
    await expect(S.createEnquiry({ companyName: `${tag} Nope`, requirement: "x" })).rejects.toThrow(/access/);
    const q = await Q.createQuote(dealId);
    const items = await db.select().from(schema.quoteItems).where(eq(schema.quoteItems.quoteId, q.id)).orderBy(asc(schema.quoteItems.position));
    expect(items.map((i) => i.section)).toEqual(["Cameras & recording", "Cameras & recording", "Cabling & accessories", "Installation", "Alarm system"]);
    expect(items.find((i) => i.description === "Cat6 cable")?.unit).toBe("m");
    expect(items.some((i) => i.description.includes("Extra camera"))).toBe(false);
    const [quote] = await db.select().from(schema.quotes).where(eq(schema.quotes.id, q.id));
    // 100 + 600 + 300*3 + 2*900 + 1200
    expect(quote.subtotal).toBe(4600);
  });

  it("renaming a section moves its lines; renaming onto another merges them", async () => {
    await as(seller, "seller");
    await B.renameBoqSection(projectId, "Alarm system", "Intruder alarm");
    let lines = await D.boqLines(dealId);
    expect(lines.find((l) => l.description === "Alarm panel")?.section).toBe("Intruder alarm");
    await B.renameBoqSection(projectId, "Intruder alarm", "installation");
    lines = await D.boqLines(dealId);
    expect(lines.find((l) => l.description === "Alarm panel")?.section).toBe("Installation");
    expect((await D.getProject(projectId, { id: seller, seesAll: false }))?.boqSections).not.toContain("Intruder alarm");
  });

  it("will not remove a section that still has lines, and moves sections and lines", async () => {
    await as(seller, "seller");
    await expect(B.deleteBoqSection(projectId, "Installation")).rejects.toThrow(/still has lines/);
    await B.deleteBoqSection(projectId, "Testing & commissioning");
    await B.moveBoqSection(projectId, "Installation", "up");
    expect((await D.getProject(projectId, { id: seller, seesAll: false }))?.boqSections).toEqual(["Cameras & recording", "Installation", "Cabling & accessories"]);
    const cams = (await D.boqLines(dealId)).filter((l) => l.section === "Cameras & recording").sort((a, b) => a.position - b.position);
    await B.moveBoqLine(cams[1].id, "up");
    const after = (await D.boqLines(dealId)).filter((l) => l.section === "Cameras & recording").sort((a, b) => a.position - b.position);
    expect(after[0].id).toBe(cams[1].id);
  });

  it("someone not on the deal cannot touch the BOQ", async () => {
    await as(other, "other");
    await expect(B.addBoqLine(projectId, line())).rejects.toThrow(/not assigned/);
    const anyLine = (await D.boqLines(dealId))[0];
    await expect(B.deleteBoqLine(anyLine.id)).rejects.toThrow(/not assigned/);
  });
});
