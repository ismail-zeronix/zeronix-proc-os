import "dotenv/config";
import { afterAll, describe, expect, it, vi } from "vitest";
import { adminQuery, closeAdmin, createTestOrg } from "./helpers/orgs";

vi.mock("server-only", () => ({}));

const live = !!process.env.DATABASE_URL;

/** The per-organisation config cache (lib/org-config.ts) in the SaaS install: one organisation's copy never serves another. */
describe.skipIf(!live)("cached settings and brand never cross organisations", () => {
  const orgIds: number[] = [];

  afterAll(async () => {
    const OC = await import("@/lib/org-config");
    OC.setOrgConfigCache(false);
    await OC.closeOrgConfig();
    if (orgIds.length) {
      await adminQuery("DELETE FROM settings WHERE organization_id = ANY($1)", [orgIds]);
      await adminQuery("DELETE FROM brand_profile WHERE organization_id = ANY($1)", [orgIds]);
      await adminQuery("DELETE FROM organizations WHERE id = ANY($1)", [orgIds]);
    }
    await closeAdmin();
  });

  it("reads each organisation's own values, however the calls interleave", async () => {
    const { runAsOrg } = await import("@/db");
    const OC = await import("@/lib/org-config");
    const S = await import("@/lib/settings");
    const B = await import("@/lib/brand");
    OC.setOrgConfigCache(true);
    const tag = `CACHE${Date.now()}`;
    const [a] = await createTestOrg({ name: `${tag} A` });
    const [b] = await createTestOrg({ name: `${tag} B` });
    orgIds.push(a.id, b.id);
    await adminQuery("INSERT INTO settings (organization_id, key, value) VALUES ($1, 'quote_trn', '100000000000011'), ($2, 'quote_trn', '100000000000022')", [a.id, b.id]);
    await adminQuery("INSERT INTO brand_profile (organization_id, company) VALUES ($1, $3), ($2, $4) ON CONFLICT (organization_id) DO UPDATE SET company = excluded.company", [a.id, b.id, `${tag} A`, `${tag} B`]);

    for (let i = 0; i < 2; i++) {
      expect(await runAsOrg(a.id, () => S.getSetting("quote_trn"))).toBe("100000000000011");
      expect(await runAsOrg(b.id, () => S.getSetting("quote_trn"))).toBe("100000000000022");
      expect((await runAsOrg(a.id, () => B.getBrandRow()))?.company).toBe(`${tag} A`);
      expect((await runAsOrg(b.id, () => B.getBrandRow()))?.company).toBe(`${tag} B`);
    }
    // a write in one organisation drops only that organisation's copy
    await runAsOrg(a.id, () => S.setSetting("quote_trn", "100000000000033"));
    expect(await runAsOrg(a.id, () => S.getSetting("quote_trn"))).toBe("100000000000033");
    expect(await runAsOrg(b.id, () => S.getSetting("quote_trn"))).toBe("100000000000022");
  });
});
