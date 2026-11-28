import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { db, pool, schema } = await import("@/db");
const D = await import("drizzle-orm");
const { closeOrgConfig, configChanged, orgCached, setOrgConfigCache } = await import("@/lib/org-config");
const { getSetting, getSettings, setSetting } = await import("@/lib/settings");
const { brandChanged, getBrandRow } = await import("@/lib/brand");
const { orgProfile } = await import("@/lib/org");

const KEY = "stale_days" as const;
let saved: string | null = null;
let savedBrand: string | null = null;
let madeBrand = false;

const until = async (check: () => Promise<boolean>, ms = 3000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await check()) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return false;
};

beforeAll(async () => {
  const [row] = await db.select().from(schema.settings).where(D.eq(schema.settings.key, KEY));
  saved = row?.value ?? null;
  const [b] = await db.select({ tagline: schema.brandProfile.tagline }).from(schema.brandProfile).where(D.eq(schema.brandProfile.id, 1));
  savedBrand = b?.tagline ?? null;
  if (!b) {
    await db.insert(schema.brandProfile).values({ id: 1 });
    madeBrand = true;
  }
  setOrgConfigCache(true);
});

afterAll(async () => {
  setOrgConfigCache(false);
  if (saved === null) await db.delete(schema.settings).where(D.eq(schema.settings.key, KEY));
  else await db.update(schema.settings).set({ value: saved }).where(D.eq(schema.settings.key, KEY));
  if (madeBrand) await db.delete(schema.brandProfile).where(D.eq(schema.brandProfile.id, 1));
  else if (savedBrand !== null) await db.update(schema.brandProfile).set({ tagline: savedBrand }).where(D.eq(schema.brandProfile.id, 1));
  await closeOrgConfig();
});

describe("the per-company config cache", () => {
  it("reads once and hands the same copy out until something changes", async () => {
    let loads = 0;
    const load = async () => ++loads;
    expect(await orgCached(990001, "settings", load)).toBe(1);
    expect(await orgCached(990001, "settings", load)).toBe(1);
    // another company has its own copy
    expect(await orgCached(990002, "settings", load)).toBe(2);
    await configChanged(990001, "settings");
    expect(await orgCached(990001, "settings", load)).toBe(3);
    expect(await orgCached(990002, "settings", load)).toBe(2);
  });

  it("does not keep a failed read", async () => {
    await expect(orgCached(990003, "brand", async () => Promise.reject(new Error("db down")))).rejects.toThrow("db down");
    expect(await orgCached(990003, "brand", async () => "ok")).toBe("ok");
  });

  it("serves settings from memory, and a save through setSetting is seen at once", async () => {
    await setSetting(KEY, "21");
    expect(await getSetting(KEY)).toBe("21");
    expect((await getSettings())[KEY]).toBe("21");
    // a write that bypasses setSetting is not seen: proof the copy comes from memory
    await db.update(schema.settings).set({ value: "22" }).where(D.eq(schema.settings.key, KEY));
    expect(await getSetting(KEY)).toBe("21");
    await setSetting(KEY, "23");
    expect(await getSetting(KEY)).toBe("23");
  });

  it("drops the copy when another process says so (NOTIFY), only after that process commits", async () => {
    expect(await getSetting(KEY)).toBe("23");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("UPDATE settings SET value = '24' WHERE key = $1", [KEY]);
      await client.query("SELECT pg_notify('zx_config', '1:settings')");
      // not committed yet: nothing heard, the old value stays
      await new Promise((r) => setTimeout(r, 300));
      expect(await getSetting(KEY)).toBe("23");
      await client.query("COMMIT");
    } finally {
      client.release();
    }
    expect(await until(async () => (await getSetting(KEY)) === "24")).toBe(true);
  });

  it("covers the brand profile and the organisation row too", async () => {
    const before = await getBrandRow();
    expect(before).toBeTruthy();
    if (!before) return;
    await db.update(schema.brandProfile).set({ tagline: `${before.tagline} (cache test)` }).where(D.eq(schema.brandProfile.id, 1));
    expect((await getBrandRow())?.tagline).toBe(before.tagline);
    await brandChanged();
    expect((await getBrandRow())?.tagline).toBe(`${before.tagline} (cache test)`);

    const org = await orgProfile(1);
    await configChanged(1, "org");
    expect((await orgProfile(1)).name).toBe(org.name);
  });
});
