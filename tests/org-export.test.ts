import "dotenv/config";
import JSZip from "jszip";
import { describe, expect, it, vi } from "vitest";
import { adminQuery, createTestOrg } from "./helpers/orgs";

vi.mock("server-only", () => ({}));

const live = !!process.env.DATABASE_URL && !!process.env.TEST_ADMIN_DATABASE_URL;

describe("export cells", () => {
  it("quote what needs it and defuse spreadsheet formulas", async () => {
    const { csvCell } = await import("@/lib/org-export");
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell('say "hi", ok')).toBe('"say ""hi"", ok"');
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("-12")).toBe("'-12");
    expect(csvCell(null)).toBe("");
    expect(csvCell({ a: 1 })).toBe('"{""a"":1}"');
  });
});

describe.skipIf(!live)("download all our data (needs the test database)", () => {
  it("has the organisation's own rows only, no secrets, and its files", async () => {
    const { db, runAsOrg } = await import("@/db");
    const { buildOrgExport } = await import("@/lib/org-export");
    const tag = `ZZEXP${Date.now()}`;
    const a = (await createTestOrg({ name: `${tag} A` }))[0].id;
    const b = (await createTestOrg({ name: `${tag} B` }))[0].id;
    await adminQuery("INSERT INTO companies (organization_id, name, name_norm) VALUES ($1, $2, $3), ($4, $5, $6)", [a, `${tag} A customer`, `${tag}acustomer`.toLowerCase(), b, `${tag} B customer`, `${tag}bcustomer`.toLowerCase()]);
    await adminQuery("INSERT INTO users (organization_id, name, email, password_hash, role) VALUES ($1, 'Aisha', $2, 'secret-hash', 'admin')", [a, `${tag.toLowerCase()}@exp.test`]);

    const r = await runAsOrg(a, () => buildOrgExport(db, a, `${tag} A`));
    expect(r.tables).toBeGreaterThanOrEqual(2);
    const zip = await JSZip.loadAsync(r.zip);
    const companies = await zip.file("tables/companies.csv")!.async("string");
    expect(companies).toContain(`${tag} A customer`);
    expect(companies).not.toContain(`${tag} B customer`);
    expect(companies.split("\r\n")[0]).not.toContain("organization_id");
    const users = await zip.file("tables/users.csv")!.async("string");
    expect(users).toContain(`${tag.toLowerCase()}@exp.test`);
    expect(users).not.toContain("password_hash");
    expect(users).not.toContain("secret-hash");
    expect(await zip.file("README.txt")!.async("string")).toContain(`All data of ${tag} A`);
    expect(zip.file("tables/organization.csv")).not.toBeNull();
  });
});
