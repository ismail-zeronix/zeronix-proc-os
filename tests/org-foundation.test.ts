import "dotenv/config";
import { describe, expect, it, vi } from "vitest";
import { fiscalYearOf } from "@/lib/org";
import { seriesNumber } from "@/lib/doc-numbers";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => new Headers({ "x-forwarded-for": "10.1.2.3, 10.0.0.1" }) }));

describe("organisation helpers", () => {
  it("names the fiscal year by the year it starts in", () => {
    expect(fiscalYearOf("2026-11-05", 1)).toBe(2026);
    expect(fiscalYearOf("2026-04-01", 4)).toBe(2026);
    expect(fiscalYearOf("2027-03-31", 4)).toBe(2026);
  });

  it("formats series numbers", () => {
    expect(seriesNumber("JV", 2026, 7)).toBe("JV-2026-0007");
    expect(seriesNumber("JV", 0, 12, 5)).toBe("JV-00012");
  });
});

const live = !!process.env.DATABASE_URL;

describe.skipIf(!live)("organisation foundation (needs the dev database)", () => {
  const key = `zztest${Date.now()}`;

  it("has Zeronix as organisation 1 and every money row belongs to it", async () => {
    const { db, schema } = await import("@/db");
    const { sql } = await import("drizzle-orm");
    const { orgProfile } = await import("@/lib/org");
    const p = await orgProfile(1);
    expect(p).toMatchObject({ id: 1, country: "AE", baseCurrency: "AED", taxRegime: "AE_VAT", fiscalYearStartMonth: 1 });
    const res = await db.execute<{ n: number }>(sql`SELECT count(*)::int n FROM ${schema.invoices} WHERE organization_id <> 1`);
    expect(res.rows[0].n).toBe(0);
  });

  it("numbers a series without gaps, and a failed save gives the number back", async () => {
    const { db } = await import("@/db");
    const { takeSeriesNumber } = await import("@/lib/doc-numbers");
    const spec = { orgId: 1, key, prefix: "ZT", fiscalYear: 2026 };
    const a = await db.transaction((tx) => takeSeriesNumber(tx, spec));
    await expect(
      db.transaction(async (tx) => {
        await takeSeriesNumber(tx, spec);
        throw new Error("save failed");
      }),
    ).rejects.toThrow("save failed");
    const b = await db.transaction((tx) => takeSeriesNumber(tx, spec));
    expect([a.number, b.number]).toEqual(["ZT-2026-0001", "ZT-2026-0002"]);
    // two saves at the same moment never get the same number
    const both = await Promise.all([1, 2, 3].map(() => db.transaction((tx) => takeSeriesNumber(tx, spec))));
    expect(new Set(both.map((x) => x.seq)).size).toBe(3);
    expect(both.map((x) => x.seq).sort()).toEqual([3, 4, 5]);
  });

  it("scopes a transaction to one organisation", async () => {
    const { sql } = await import("drizzle-orm");
    const { withOrg } = await import("@/lib/org");
    const seen = await withOrg(1, async (tx) => (await tx.execute<{ org: string }>(sql`SELECT current_setting('app.org_id', true) AS org`)).rows[0].org);
    expect(seen).toBe("1");
    await expect(withOrg(0, async () => 1)).rejects.toThrow(/Bad organisation/);
  });

  it("writes the audit trail inside the transaction, with the caller's IP", async () => {
    const { db, schema } = await import("@/db");
    const { eq } = await import("drizzle-orm");
    const { audit } = await import("@/lib/audit");
    await db.transaction((tx) => audit(tx, { userId: null, action: "test.write", entity: key, entityId: 1, summary: "kept", after: { a: 1 } }));
    await expect(
      db.transaction(async (tx) => {
        await audit(tx, { userId: null, action: "test.write", entity: key, entityId: 2, summary: "rolled back" });
        throw new Error("undo");
      }),
    ).rejects.toThrow("undo");
    const rows = await db.select().from(schema.auditLog).where(eq(schema.auditLog.entity, key));
    expect(rows.map((r) => r.summary)).toEqual(["kept"]);
    expect(rows[0]).toMatchObject({ organizationId: 1, ip: "10.1.2.3", after: { a: 1 } });
    await db.delete(schema.auditLog).where(eq(schema.auditLog.entity, key));
    await db.delete(schema.docSeries).where(eq(schema.docSeries.key, key));
  });
});
