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

describe.skipIf(!live)("projects (needs the dev database)", () => {
  let db: typeof import("@/db").db;
  let schema: typeof import("@/db").schema;
  let pool: typeof import("@/db").pool;
  let eq: typeof import("drizzle-orm").eq;
  let inArray: typeof import("drizzle-orm").inArray;
  let and: typeof import("drizzle-orm").and;
  let S: typeof import("@/app/(app)/sales/actions");
  let P: typeof import("@/app/(app)/projects/actions");
  let D: typeof import("@/lib/projects-data");
  let userIds: number[] = [];
  let seller: number, other: number;
  const tag = `ZZPRJ${Date.now()}`;

  const as = async (id: number, name: string, role: "admin" | "sales" = "sales") => {
    cookieValue = await new SignJWT({ name, email: `${name}@example.test`, role })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(String(id))
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(process.env.AUTH_SECRET));
  };
  const details = { siteAddress: "", siteMapUrl: "", startDate: "", targetDate: "", notes: "", managerId: null };

  beforeAll(async () => {
    ({ db, schema, pool } = await import("@/db"));
    ({ eq, inArray, and } = await import("drizzle-orm"));
    S = await import("@/app/(app)/sales/actions");
    P = await import("@/app/(app)/projects/actions");
    D = await import("@/lib/projects-data");
    const mk = async (name: string) =>
      (await db.insert(schema.users).values({ name: `${tag}-${name}`, email: `${tag}-${name}@example.test`, passwordHash: "x", role: "sales" }).returning({ id: schema.users.id }))[0].id;
    seller = await mk("seller");
    other = await mk("other");
    userIds = [seller, other];
    const { dubaiToday } = await import("@/lib/dates");
    await db.insert(schema.attendancePunches).values(userIds.map((userId) => ({ userId, day: dubaiToday() })));
  });

  afterAll(async () => {
    const cs = await db.select({ id: schema.companies.id, name: schema.companies.name }).from(schema.companies);
    const ids = cs.filter((c) => c.name.includes(tag)).map((c) => c.id);
    if (ids.length) {
      const deals = await db.select({ id: schema.deals.id }).from(schema.deals).where(inArray(schema.deals.companyId, ids));
      if (deals.length) await db.delete(schema.tasks).where(and(eq(schema.tasks.relatedType, "deal"), inArray(schema.tasks.relatedId, deals.map((d) => d.id))));
      await db.delete(schema.companies).where(inArray(schema.companies.id, ids)); // deals and projects go with them
    }
    await db.delete(schema.tasks).where(inArray(schema.tasks.createdBy, userIds));
    await db.delete(schema.attendancePunches).where(inArray(schema.attendancePunches.userId, userIds));
    await db.delete(schema.users).where(inArray(schema.users.id, userIds));
    await pool.end();
  });

  let dealId: number, projectId: number;

  it("a project deal opens a numbered project", async () => {
    await as(seller, "seller");
    const res = await S.createEnquiry({ companyName: `${tag} Warehouse LLC`, requirement: "16 IP cameras", kind: "project", projectType: "cctv", valueAed: 45000 });
    expect(res.projectId).toBeTruthy();
    dealId = res.id;
    projectId = res.projectId!;
    const [deal] = await db.select().from(schema.deals).where(eq(schema.deals.id, dealId));
    expect(deal.kind).toBe("project");
    const [p] = await db.select().from(schema.projects).where(eq(schema.projects.id, projectId));
    expect(p.number).toMatch(/^ZPJ-\d{4}-\d{4}$/);
    expect(p.typeKey).toBe("cctv");
    expect(p.managerId).toBe(seller);
    const [act] = await db.select().from(schema.activities).where(eq(schema.activities.dealId, dealId));
    expect(act.body).toContain(p.number);
  });

  it("needs a project type", async () => {
    await as(seller, "seller");
    await expect(S.createEnquiry({ companyName: `${tag} No Type LLC`, kind: "project", requirement: "cabling" })).rejects.toThrow(/project type/);
  });

  it("shows the project to its team only", async () => {
    const list = await D.listProjects({ id: seller, seesAll: false });
    const row = list.find((r) => r.id === projectId);
    expect(row?.phase).toBe("lead");
    expect(row?.typeLabel).toBe("CCTV");
    expect(await D.getProject(projectId, { id: other, seesAll: false })).toBeNull();
    await as(other, "other");
    await expect(P.updateProjectDetails(projectId, { ...details, siteAddress: "x" })).rejects.toThrow(/not assigned/);
  });

  it("saves site details and checks the dates and map link", async () => {
    await as(seller, "seller");
    await P.updateProjectDetails(projectId, { siteAddress: "Al Quoz 3, Dubai", siteMapUrl: "https://maps.example/x", startDate: "2026-11-01", targetDate: "2026-11-20", notes: "Gate pass", managerId: seller });
    const p = await D.getProject(projectId, { id: seller, seesAll: false });
    expect(p?.siteAddress).toBe("Al Quoz 3, Dubai");
    expect(p?.targetDate).toBe("2026-11-20");
    await expect(P.updateProjectDetails(projectId, { ...details, startDate: "2026-11-20", targetDate: "2026-11-01" })).rejects.toThrow(/before the start/);
    await expect(P.updateProjectDetails(projectId, { ...details, siteMapUrl: "javascript:alert(1)" })).rejects.toThrow();
  });

  it("work status only moves once the deal is won, and closing keeps the completion day", async () => {
    await as(seller, "seller");
    await expect(P.setProjectStatus(projectId, "in_progress")).rejects.toThrow(/once the deal is won/);
    await S.moveDeal(dealId, "won");
    await P.setProjectStatus(projectId, "in_progress");
    expect((await D.getProject(projectId, { id: seller, seesAll: false }))?.phase).toBe("active");
    // the CCTV checklist has required tasks: completing is refused until they are done, and only an admin may override
    const blocked = await P.setProjectStatus(projectId, "completed");
    expect(blocked.openRequired?.length).toBeGreaterThan(0);
    expect((await D.getProject(projectId, { id: seller, seesAll: false }))?.phase).toBe("active");
    await expect(P.setProjectStatus(projectId, "completed", true)).rejects.toThrow(/Only an admin/);
    const C = await import("@/app/(app)/projects/checklist-actions");
    for (const t of await D.checklistOf(projectId)) if (t.required) await C.setChecklistDone(t.id, true);
    expect(await P.setProjectStatus(projectId, "completed")).toEqual({});
    const done = await D.getProject(projectId, { id: seller, seesAll: false });
    expect(done?.phase).toBe("done");
    expect(done?.completedOn).toBeTruthy();
    await P.setProjectStatus(projectId, "closed");
    expect((await D.getProject(projectId, { id: seller, seesAll: false }))?.completedOn).toBe(done?.completedOn);
  });

  it("a started project cannot be turned back into a product deal", async () => {
    await as(seller, "seller");
    await expect(S.setDealKind(dealId, "product")).rejects.toThrow(/started/);
  });

  it("an existing product deal can become a project and back, keeping its number", async () => {
    await as(seller, "seller");
    const res = await S.createEnquiry({ companyName: `${tag} Office LLC`, requirement: "10 laptops" });
    expect(res.projectId).toBeNull();
    const made = await S.setDealKind(res.id, "project", "networking");
    expect(made.projectId).toBeTruthy();
    expect(await D.projectOfDeal(res.id)).toMatchObject({ typeKey: "networking" });
    await S.setDealKind(res.id, "project", "server_room");
    expect(await D.projectOfDeal(res.id)).toMatchObject({ id: made.projectId, typeKey: "server_room" });
    await S.setDealKind(res.id, "product");
    expect(await D.projectOfDeal(res.id)).toBeNull();
    expect((await S.setDealKind(res.id, "project", "server_room")).projectId).toBe(made.projectId);
  });

  it("the overview counts only what the viewer may see", async () => {
    const o = await D.projectsOverview({ id: seller, seesAll: false }, seller);
    expect(o.phases.find((p) => p.phase === "done")?.count).toBe(1);
    expect(o.phases.find((p) => p.phase === "lead")?.count).toBe(1);
    const outsider = await D.projectsOverview({ id: other, seesAll: false }, other);
    expect(outsider.phases.every((p) => p.count === 0)).toBe(true);
  });
});
