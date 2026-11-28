import "dotenv/config";
import { afterAll, describe, expect, it, vi } from "vitest";
import { INDUSTRIES, industryApps, industryByKey } from "@/lib/industries";
import { GOODS_UNITS, SERVICE_UNITS, type StarterCategory } from "@/lib/items";

vi.mock("server-only", () => ({}));

describe("industry templates", () => {
  it("are consistent: unique keys, units that exist, no stock for service providers", () => {
    expect(new Set(INDUSTRIES.map((i) => i.key)).size).toBe(INDUSTRIES.length);
    for (const t of INDUSTRIES) {
      expect(t.categories.length).toBeGreaterThan(0);
      expect(new Set(t.categories.map((c) => c.name.toLowerCase())).size).toBe(t.categories.length);
      for (const c of t.categories as readonly StarterCategory[]) {
        if (c.unit) expect([...(c.kind === "service" ? SERVICE_UNITS : GOODS_UNITS)] as string[]).toContain(c.unit);
        if (t.businessType === "services") expect(c.kind, `${t.key}: ${c.name}`).toBe("service");
      }
      // only traders are offered the Inventory app
      expect(t.apps.includes("inventory" as never)).toBe(t.businessType === "trader");
    }
  });

  it("suggest apps only within what the plan allows", () => {
    expect(industryApps("contracting", ["crm", "sales", "projects"])).toEqual(["crm", "sales", "projects"]);
    expect(industryApps("consulting", ["crm", "sales", "inventory"])).toEqual(["crm", "sales"]);
    expect(industryByKey("nope")).toBeUndefined();
  });
});

describe("applying an industry to a company", async () => {
  const { db, schema } = await import("@/db");
  const D = await import("drizzle-orm");
  const { applyIndustry } = await import("@/lib/industry-apply");
  const orgIds: number[] = [];
  const newOrg = async (businessType: "trader" | "services" | null) => {
    const [o] = await db.insert(schema.organizations).values({ name: `IND${Date.now()}-${orgIds.length}`, businessType }).returning({ id: schema.organizations.id });
    orgIds.push(o.id);
    return o.id;
  };

  afterAll(async () => {
    if (!orgIds.length) return;
    await db.delete(schema.itemCategories).where(D.inArray(schema.itemCategories.organizationId, orgIds));
    await db.delete(schema.organizations).where(D.inArray(schema.organizations.id, orgIds));
  });

  it("records it, sets the business type when none was chosen, and adds its categories once", async () => {
    const orgId = await newOrg(null);
    const r = await db.transaction((tx) => applyIndustry(tx, orgId, "maintenance"));
    expect(r.businessType).toBe("services");
    expect(r.apps).toContain("projects");
    const [org] = await db.select().from(schema.organizations).where(D.eq(schema.organizations.id, orgId));
    expect(org).toMatchObject({ industry: "maintenance", businessType: "services" });
    const cats = await db.select().from(schema.itemCategories).where(D.eq(schema.itemCategories.organizationId, orgId));
    expect(cats.map((c) => c.name).sort()).toEqual([...industryByKey("maintenance")!.categories.map((c) => c.name)].sort());
    expect(cats.every((c) => c.kind === "service" && !c.trackStock)).toBe(true);
    // again: nothing doubles
    expect((await db.transaction((tx) => applyIndustry(tx, orgId, "maintenance"))).added).toBe(0);
  });

  it("keeps a business type already chosen, and never tracks stock for a service provider", async () => {
    const orgId = await newOrg("services");
    const r = await db.transaction((tx) => applyIndustry(tx, orgId, "general_trading"));
    expect(r.businessType).toBe("services");
    const cats = await db.select().from(schema.itemCategories).where(D.eq(schema.itemCategories.organizationId, orgId));
    expect(cats.some((c) => c.trackStock || c.trackSerials)).toBe(false);
    await expect(db.transaction((tx) => applyIndustry(tx, orgId, "bakery"))).rejects.toThrow(/Pick the industry/);
  });
});
