import "dotenv/config";
import { SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { adminQuery, closeAdmin, createTestOrg } from "./helpers/orgs";

// the cookie (the signed-in user, with their organisation) is ours to set; refreshing pages is a no-op
let cookieValue: string | undefined;
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => (cookieValue ? { value: cookieValue } : undefined), set: (_n: string, v: string) => void (cookieValue = v) }),
  headers: async () => new Headers(),
}));
vi.mock("next/navigation", () => ({
  redirect: () => {
    throw new Error("redirect");
  },
  notFound: () => {
    throw new Error("notFound");
  },
}));

const live = !!process.env.DATABASE_URL && !!process.env.AUTH_SECRET && !!process.env.TEST_ADMIN_DATABASE_URL;

/**
 * Two organisations side by side, as on demo.zeronixos.online: whatever one does, the other never sees, changes or
 * numbers into. The tests connect as zx_app, so this is the database's row-level security at work, not app code.
 */
describe.skipIf(!live)("two organisations never see each other (needs the test database)", () => {
  let db: typeof import("@/db").db;
  let schema: typeof import("@/db").schema;
  let pool: typeof import("@/db").pool;
  let runAsOrg: typeof import("@/db").runAsOrg;
  let sql: typeof import("drizzle-orm").sql;
  let eq: typeof import("drizzle-orm").eq;
  const tag = `ZZTEN${Date.now()}`;
  const A = { org: 0, user: 0, company: 0, deal: 0, quote: 0, invoice: 0, task: 0, file: 0 };
  const B = { org: 0, user: 0 };
  let tenantTables: string[] = [];

  const signIn = async (user: number, org: number) => {
    cookieValue = await new SignJWT({ name: `${tag}-${user}`, email: `${tag}-${user}@example.test`, role: "admin", sv: 1, org })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(String(user))
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(process.env.AUTH_SECRET));
  };

  beforeAll(async () => {
    ({ db, schema, pool, runAsOrg } = await import("@/db"));
    ({ sql, eq } = await import("drizzle-orm"));
    A.org = (await createTestOrg({ name: `${tag} A` }))[0].id;
    B.org = (await createTestOrg({ name: `${tag} B` }))[0].id;
    const today = (await import("@/lib/dates")).dubaiToday();

    // organisation A: a user, a customer, a deal, a quote numbered ZQ-2099-0001, an invoice, a task, a file, settings
    await runAsOrg(A.org, async () => {
      A.user = (await db.insert(schema.users).values({ name: `${tag} Anna`, email: `${tag}-a@example.test`, passwordHash: "x", role: "admin" }).returning({ id: schema.users.id }))[0].id;
      A.company = (await db.insert(schema.companies).values({ name: `${tag} Acme`, nameNorm: `${tag.toLowerCase()} acme`, ownerId: A.user }).returning({ id: schema.companies.id }))[0].id;
      A.deal = (await db.insert(schema.deals).values({ title: `${tag} secret deal`, companyId: A.company, ownerId: A.user }).returning({ id: schema.deals.id }))[0].id;
      await db.insert(schema.dealAssignees).values({ dealId: A.deal, userId: A.user });
      A.quote = (await db.insert(schema.quotes).values({ year: 2099, seq: 1, number: "ZQ-2099-0001", validUntil: "2099-12-31", companyId: A.company, dealId: A.deal, subtotal: 1000, vatAmount: 50, total: 1050 }).returning({ id: schema.quotes.id }))[0].id;
      A.invoice = (
        await db
          .insert(schema.invoices)
          .values({ number: "INV-0001", companyId: A.company, dealId: A.deal, quoteId: A.quote, issueDate: today, supplyDate: today, termsDays: 0, dueDate: today, customerName: "Acme", vatPct: 5, subtotal: 1000, vatAmount: 50, total: 1050 })
          .returning({ id: schema.invoices.id })
      )[0].id;
      A.task = (await db.insert(schema.tasks).values({ title: `${tag} call Acme`, assignedTo: A.user, createdBy: A.user, relatedType: "deal", relatedId: A.deal }).returning({ id: schema.tasks.id }))[0].id;
      A.file = (await db.insert(schema.files).values({ name: "contract.pdf", storedName: `${crypto.randomUUID()}.pdf`, mime: "application/pdf", size: 10, folder: "other", relatedType: "deal", relatedId: A.deal, uploadedBy: A.user }).returning({ id: schema.files.id }))[0].id;
      await db.insert(schema.settings).values({ key: "quote_trn", value: "100000000000001" });
      await db.insert(schema.attendancePunches).values({ userId: A.user, day: today });
    });
    await runAsOrg(B.org, async () => {
      B.user = (await db.insert(schema.users).values({ name: `${tag} Ben`, email: `${tag}-b@example.test`, passwordHash: "x", role: "admin" }).returning({ id: schema.users.id }))[0].id;
      await db.insert(schema.attendancePunches).values({ userId: B.user, day: today });
    });
    tenantTables = (await adminQuery<{ tablename: string }>("SELECT DISTINCT tablename FROM pg_policies WHERE schemaname = 'public' AND policyname = 'org_isolation' ORDER BY 1")).map((r) => r.tablename);
  });

  afterAll(async () => {
    cookieValue = undefined;
    const { closeBus } = await import("@/lib/chat/bus");
    await closeBus();
    await pool.end();
    await closeAdmin();
  });

  it("protects every table, for the table owner too", async () => {
    expect(tenantTables.length).toBeGreaterThan(80);
    const unforced = await adminQuery<{ relname: string }>(
      `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname <> 'login_failures' AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity)`,
    );
    expect(unforced.map((r) => r.relname)).toEqual([]);
    // the app's role really is subject to it
    const [role] = (await db.execute<{ su: boolean; bypass: boolean }>(sql`SELECT rolsuper AS su, rolbypassrls AS bypass FROM pg_roles WHERE rolname = current_user`)).rows;
    expect(role).toEqual({ su: false, bypass: false });
  });

  it("organisation B sees none of A's rows, in any table", async () => {
    await signIn(B.user, B.org);
    const leaks: string[] = [];
    for (const t of tenantTables) {
      const r = await db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM ${sql.identifier(t)} WHERE organization_id IS DISTINCT FROM ${B.org}`);
      if (r.rows[0].n > 0) leaks.push(`${t}: ${r.rows[0].n}`);
    }
    expect(leaks).toEqual([]);
    // and the organisations table shows B only
    const orgs = await db.select({ id: schema.organizations.id }).from(schema.organizations);
    expect(orgs.map((o) => o.id)).toEqual([B.org]);
  });

  it("B's pages and checks treat A's records as not there", async () => {
    await signIn(B.user, B.org);
    const { getQuote } = await import("@/lib/quotes-data");
    const { getInvoice } = await import("@/lib/accounts-data");
    const V = await import("@/lib/auth/visibility");
    const admin = { id: B.user, seesAll: true };
    expect(await getQuote(A.quote, admin)).toBeNull();
    expect(await getInvoice(A.invoice)).toBeNull();
    expect(await V.canSeeRelated(admin, "deal", A.deal)).toBe(false);
    expect(await V.canSeeRelated(admin, "invoice", A.invoice)).toBe(false);
    expect(await V.canSeeRelated(admin, "company", A.company)).toBe(false);
    const { getSetting } = await import("@/lib/settings");
    expect(await getSetting("quote_trn")).toBe(""); // A's TRN is A's
    const { currentOrgId } = await import("@/lib/org");
    expect(await currentOrgId()).toBe(B.org);
  });

  it("B cannot write into A: forged organisation, or A's rows by id", async () => {
    await signIn(B.user, B.org);
    // a row naming A's organisation is refused by the policy
    await expect(db.insert(schema.companies).values({ organizationId: A.org, name: `${tag} forged`, nameNorm: `${tag.toLowerCase()} forged` })).rejects.toThrow();
    // A's rows by id: nothing to update or delete
    const up = await db.update(schema.deals).set({ title: "hacked" }).where(eq(schema.deals.id, A.deal)).returning({ id: schema.deals.id });
    expect(up).toEqual([]);
    const del = await db.delete(schema.tasks).where(eq(schema.tasks.id, A.task)).returning({ id: schema.tasks.id });
    expect(del).toEqual([]);
    // Postgres checks foreign keys without row-level security, so the app checks a link first: even an admin of B
    // ("sees everything") is told A's records do not exist, so no action of B links to them
    const V = await import("@/lib/auth/visibility");
    const bAdmin = { id: B.user, seesAll: true };
    expect(await V.canSeeCompany(bAdmin, A.company)).toBe(false);
    expect(await V.canSeeDeal(bAdmin, A.deal)).toBe(false);
    expect(await V.canSeeQuote(bAdmin, A.quote)).toBe(false);
    expect(await V.canSeeInvoice(bAdmin, A.invoice)).toBe(false);
    expect(await V.canSeeFile(bAdmin, A.file)).toBe(false);
    const [still] = await adminQuery<{ title: string }>("SELECT title FROM deals WHERE id = $1", [A.deal]);
    expect(still.title).toBe(`${tag} secret deal`);
  });

  it("each organisation numbers its own documents from 0001", async () => {
    await signIn(B.user, B.org);
    const company = (await db.insert(schema.companies).values({ name: `${tag} Bee`, nameNorm: `${tag.toLowerCase()} bee` }).returning({ id: schema.companies.id }))[0].id;
    const q = await db.insert(schema.quotes).values({ year: 2099, seq: 1, number: "ZQ-2099-0001", validUntil: "2099-12-31", companyId: company }).returning({ id: schema.quotes.id });
    expect(q).toHaveLength(1);
    // and inside one organisation the number is still unique
    await expect(db.insert(schema.quotes).values({ year: 2099, seq: 2, number: "ZQ-2099-0001", validUntil: "2099-12-31", companyId: company })).rejects.toThrow();
    // the same supplier name in two organisations
    await db.insert(schema.suppliers).values({ name: `${tag} Shared Supplier` });
    await runAsOrg(A.org, () => db.insert(schema.suppliers).values({ name: `${tag} Shared Supplier` }));
  });

  it("a user's cookie only opens their own organisation", async () => {
    const { loadAccess } = await import("@/lib/auth/session");
    await signIn(A.user, A.org);
    expect((await loadAccess())?.orgId).toBe(A.org);
    // A's user with a cookie claiming organisation B: B's queries cannot even find the user
    await signIn(A.user, B.org);
    expect(await loadAccess()).toBeNull();
  });

  it("with no organisation (SaaS, nobody signed in) nothing is visible and nothing can be saved", async () => {
    cookieValue = undefined;
    const before = process.env.MULTI_TENANT;
    process.env.MULTI_TENANT = "true";
    try {
      const n = await db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM companies`);
      expect(n.rows[0].n).toBe(0);
      await expect(db.insert(schema.companies).values({ name: `${tag} nobody`, nameNorm: "nobody" })).rejects.toThrow();
      const { currentOrgId } = await import("@/lib/org");
      await expect(currentOrgId()).rejects.toThrow(/sign in/i);
    } finally {
      if (before === undefined) delete process.env.MULTI_TENANT;
      else process.env.MULTI_TENANT = before;
    }
  });

  it("sign-in finds the user in their organisation, and a paused organisation cannot sign in", async () => {
    const { loginUser } = await import("@/lib/auth/login-user");
    cookieValue = undefined;
    expect(await loginUser(`${tag}-a@example.test`)).toMatchObject({ id: A.user, organizationId: A.org, orgActive: true });
    await adminQuery("UPDATE organizations SET status = 'suspended' WHERE id = $1", [B.org]);
    try {
      expect(await loginUser(`${tag}-b@example.test`)).toMatchObject({ id: B.user, organizationId: B.org, orgActive: false });
      // and a cookie from before the pause stops working
      const { loadAccess } = await import("@/lib/auth/session");
      await signIn(B.user, B.org);
      expect(await loadAccess()).toBeNull();
    } finally {
      await adminQuery("UPDATE organizations SET status = 'active' WHERE id = $1", [B.org]);
    }
  });

  it("the worker runs each job once per organisation, inside that organisation", async () => {
    const { eachOrg } = await import("@/worker/orgs");
    cookieValue = undefined;
    const seen: { org: string; companies: number }[] = [];
    await eachOrg(async () => {
      const r = await db.execute<{ org: string; n: number }>(sql`SELECT current_setting('app.org_id', true) AS org, (SELECT count(*)::int FROM companies WHERE name LIKE ${tag + "%"}) AS n`);
      seen.push({ org: r.rows[0].org, companies: r.rows[0].n });
    });
    const a = seen.find((s) => s.org === String(A.org));
    const b = seen.find((s) => s.org === String(B.org));
    expect(a?.companies).toBe(1);
    expect(b?.companies).toBe(1);
  });

  it("a chat broadcast to everybody reaches one organisation only", async () => {
    const bus = await import("@/lib/chat/bus");
    const gotA: unknown[] = [];
    const gotB: unknown[] = [];
    const offA = bus.subscribe(A.user, (e) => void (e.t === "card.refresh" && gotA.push(e)), A.org);
    const offB = bus.subscribe(B.user, (e) => void (e.t === "card.refresh" && gotB.push(e)), B.org);
    await new Promise((r) => setTimeout(r, 500)); // the LISTEN connection comes up
    await signIn(A.user, A.org);
    await bus.publish("all", { t: "card.refresh", ref: "quote:1" });
    await new Promise((r) => setTimeout(r, 500));
    offA();
    offB();
    expect(gotA).toHaveLength(1);
    expect(gotB).toHaveLength(0);
  });
});
