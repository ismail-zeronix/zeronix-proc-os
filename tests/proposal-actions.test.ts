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

describe.skipIf(!live)("proposals (needs the dev database)", () => {
  let db: typeof import("@/db").db;
  let schema: typeof import("@/db").schema;
  let pool: typeof import("@/db").pool;
  let eq: typeof import("drizzle-orm").eq;
  let and: typeof import("drizzle-orm").and;
  let inArray: typeof import("drizzle-orm").inArray;
  let S: typeof import("@/app/(app)/crm/actions");
  let A: typeof import("@/app/(app)/projects/proposal-actions");
  let D: typeof import("@/lib/proposals-data");
  let L: typeof import("@/lib/proposal");
  let userIds: number[] = [];
  let seller: number, other: number;
  const tag = `ZZPROP${Date.now()}`;

  const as = async (id: number, name: string) => {
    cookieValue = await new SignJWT({ name, email: `${name}@example.test`, role: "sales" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(String(id))
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(process.env.AUTH_SECRET));
  };

  beforeAll(async () => {
    ({ db, schema, pool } = await import("@/db"));
    ({ eq, and, inArray } = await import("drizzle-orm"));
    S = await import("@/app/(app)/crm/actions");
    A = await import("@/app/(app)/projects/proposal-actions");
    D = await import("@/lib/proposals-data");
    L = await import("@/lib/proposal");
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
      await db.delete(schema.companies).where(inArray(schema.companies.id, ids)); // projects and proposals go with them
    }
    await db.delete(schema.proposalTemplates).where(inArray(schema.proposalTemplates.createdBy, userIds));
    await db.delete(schema.termsLibrary).where(inArray(schema.termsLibrary.createdBy, userIds));
    await db.delete(schema.tasks).where(inArray(schema.tasks.createdBy, userIds));
    await db.delete(schema.attendancePunches).where(inArray(schema.attendancePunches.userId, userIds));
    await db.delete(schema.users).where(inArray(schema.users.id, userIds));
    await pool.end();
  });

  let projectId: number, proposalId: number;

  it("starts from the standard proposal, once per project", async () => {
    await as(seller, "seller");
    const r = await S.createDeal({ companyName: `${tag} Villa`, requirement: "CCTV for the villa\nalarm on two doors", kind: "project", projectType: "cctv" });
    projectId = r.projectId!;
    const { id } = await A.startProposal(projectId, null);
    proposalId = id;
    expect((await A.startProposal(projectId, null)).id).toBe(id);
    const p = await D.proposalOf(projectId);
    expect(p?.version).toBe(1);
    expect(p?.blocks[0]).toMatchObject({ type: "cover", data: { title: "CCTV project proposal" } });
    expect(p?.blocks.some((b) => b.type === "text" && L.docText(b.data.doc).includes("alarm on two doors"))).toBe(true);
  });

  it("autosave moves the version on and refuses to overwrite a newer one", async () => {
    await as(seller, "seller");
    const p = (await D.proposalOf(projectId))!;
    const blocks = [...p.blocks, L.newBlock("divider")];
    const first = await A.saveProposal(proposalId, p.version, { title: "Villa proposal", blocks });
    expect(first).toMatchObject({ ok: true, version: 2 });
    // a second tab still based on version 1
    const stale = await A.saveProposal(proposalId, 1, { title: "Old tab", blocks: p.blocks });
    expect(stale).toMatchObject({ ok: false, conflict: true });
    expect(stale.ok ? "" : stale.by).toContain("seller");
    const now = (await D.proposalOf(projectId))!;
    expect(now.title).toBe("Villa proposal");
    expect(now.blocks).toHaveLength(blocks.length);
  });

  it("refuses broken documents", async () => {
    await as(seller, "seller");
    const p = (await D.proposalOf(projectId))!;
    await expect(A.saveProposal(proposalId, p.version, { title: "x", blocks: [{ id: "a", type: "iframe", data: {} }] as never })).rejects.toThrow();
    await expect(A.saveProposal(proposalId, p.version, { title: "x", blocks: [p.blocks[0], p.blocks[0]] })).rejects.toThrow(/same id/);
    expect((await D.proposalOf(projectId))!.version).toBe(p.version);
  });

  it("someone not on the project cannot open, save or copy it", async () => {
    await as(other, "other");
    await expect(A.startProposal(projectId, null)).rejects.toThrow(/not assigned/);
    await expect(A.saveProposal(proposalId, 2, { title: "x", blocks: [] })).rejects.toThrow(/not assigned/);
    await expect(A.saveAsTemplate(proposalId, "Steal", false)).rejects.toThrow(/not assigned/);
  });

  it("saves as a template; another project starts from it with fresh block ids", async () => {
    await as(seller, "seller");
    await A.saveAsTemplate(proposalId, `${tag} Villa CCTV`, true);
    const templates = await D.proposalTemplates("cctv");
    const t = templates.find((x) => x.name === `${tag} Villa CCTV`)!;
    expect(t.typeKey).toBe("cctv");
    expect((await D.proposalTemplates("networking")).some((x) => x.id === t.id)).toBe(false);
    const r = await S.createDeal({ companyName: `${tag} Office`, requirement: "cameras", kind: "project", projectType: "cctv" });
    await A.startProposal(r.projectId!, t.id);
    const a = (await D.proposalOf(projectId))!;
    const b = (await D.proposalOf(r.projectId!))!;
    expect(b.blocks.map((x) => x.type)).toEqual(a.blocks.map((x) => x.type));
    expect(b.blocks.some((x) => a.blocks.some((y) => y.id === x.id))).toBe(false);
    // only its author (or an admin) removes it
    await as(other, "other");
    await expect(A.deleteProposalTemplate(t.id)).rejects.toThrow(/Only the person/);
    await as(seller, "seller");
    await A.deleteProposalTemplate(t.id);
    expect((await D.proposalTemplates("cctv")).some((x) => x.id === t.id)).toBe(false);
  });

  it("starting again from a template replaces the document, based on the current version", async () => {
    await as(seller, "seller");
    const p = (await D.proposalOf(projectId))!;
    await expect(A.applyTemplate(proposalId, p.version - 1, null)).rejects.toThrow(/changed this proposal/);
    const r = await A.applyTemplate(proposalId, p.version, null);
    expect(r.version).toBe(p.version + 1);
    expect((await D.proposalOf(projectId))!.blocks.some((b) => b.type === "divider")).toBe(false);
  });

  it("a quote made from the BOQ freezes the proposal; updating the quote refreshes the copy", async () => {
    await as(seller, "seller");
    const B = await import("@/app/(app)/projects/boq-actions");
    const Q = await import("@/app/(app)/accounts/quote-actions");
    await B.addBoqLine(projectId, { section: "Cameras & recording", description: "Dome camera", lineType: "material", unit: "nos", qty: 4, costAed: 200, unitPriceAed: 300, optional: false });
    const [deal] = await db.select({ id: schema.projects.dealId }).from(schema.projects).where(eq(schema.projects.id, projectId));
    const quote = await Q.createQuote(deal.id);
    const snap = await D.snapshotOfQuote(quote.id);
    expect(snap?.cover).toMatchObject({ projectNumber: expect.stringMatching(/^ZPJ-/), quoteNumber: quote.number });
    expect(snap?.boq.lines[0]).toMatchObject({ description: "Dome camera", costAed: null });
    expect(snap?.blocks[0].type).toBe("cover");
    const [q] = await db.select({ terms: schema.quotes.terms }).from(schema.quotes).where(eq(schema.quotes.id, quote.id));
    expect(q.terms).toContain("proposal");
    // change the proposal title block and the price, then update the quote: the frozen copy follows
    const p = (await D.proposalOf(projectId))!;
    const blocks = p.blocks.map((b) => (b.type === "cover" ? { ...b, data: { ...b.data, title: "Revised CCTV proposal" } } : b));
    await A.saveProposal(proposalId, p.version, { title: p.title, blocks });
    const before = (await D.snapshotOfQuote(quote.id))!;
    expect(before.blocks[0].type === "cover" && before.blocks[0].data.title).not.toBe("Revised CCTV proposal");
    await Q.reviseQuote(quote.id);
    const after = (await D.snapshotOfQuote(quote.id))!;
    expect(after.blocks[0].type === "cover" && after.blocks[0].data.title).toBe("Revised CCTV proposal");
    await db.delete(schema.quotes).where(eq(schema.quotes.id, quote.id));
  });

  it("product quotes keep the product terms and get no proposal copy", async () => {
    await as(seller, "seller");
    const Q = await import("@/app/(app)/accounts/quote-actions");
    const r = await S.createDeal({ companyName: `${tag} Shop`, requirement: "5 laptops" });
    await db.insert(schema.dealItems).values({ dealId: r.id, description: "Laptop", qty: 5, unitPriceAed: 3000 });
    const quote = await Q.createQuote(r.id);
    expect(await D.snapshotOfQuote(quote.id)).toBeNull();
    const [q] = await db.select({ terms: schema.quotes.terms }).from(schema.quotes).where(eq(schema.quotes.id, quote.id));
    expect(q.terms).not.toContain("attached proposal");
    await db.delete(schema.quotes).where(eq(schema.quotes.id, quote.id));
  });

  it("keeps standard texts in the library", async () => {
    await as(seller, "seller");
    const { id } = await A.saveTermsText({ title: `${tag} Warranty 24 months`, doc: L.richDoc(L.para("Two years on workmanship.")) });
    expect((await D.termsLibrary()).find((t) => t.id === id)?.doc).toMatchObject({ type: "doc" });
    await as(other, "other");
    await expect(A.deleteTermsText(id)).rejects.toThrow(/Only the person/);
    await as(seller, "seller");
    await A.deleteTermsText(id);
    expect((await D.termsLibrary()).some((t) => t.id === id)).toBe(false);
  });
});
