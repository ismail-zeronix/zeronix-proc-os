import { afterEach, describe, expect, it } from "vitest";
import { navFor } from "@/lib/app-nav";
import { planApps, TENANT_CORE_APPS, type AppKey } from "@/lib/apps";
import { assertZeronixFeatures, isZeronixOnlyPath, zeronixFeatures } from "@/lib/edition";

/** Zeronix's own features stay off in the SaaS install (MULTI_TENANT=true): lib/edition.ts. */
describe("Zeronix-only features", () => {
  const before = process.env.MULTI_TENANT;
  afterEach(() => {
    if (before === undefined) delete process.env.MULTI_TENANT;
    else process.env.MULTI_TENANT = before;
  });

  it("are on in Zeronix's own install and off in the SaaS one", () => {
    delete process.env.MULTI_TENANT;
    expect(zeronixFeatures()).toBe(true);
    expect(() => assertZeronixFeatures()).not.toThrow();
    process.env.MULTI_TENANT = "true";
    expect(zeronixFeatures()).toBe(false);
    expect(() => assertZeronixFeatures()).toThrow(/not available/);
  });

  it("knows their addresses, and not the core apps' ones", () => {
    for (const p of [
      "/accounts/payroll",
      "/accounts/payroll/12",
      "/print/payslip/3",
      "/crm/team",
      "/crm/team/7",
      "/admin/claude",
      "/admin/feeds",
      "/oauth/authorize",
      "/api/oauth/token",
      "/.well-known/oauth-authorization-server",
      "/.well-known/oauth-protected-resource/api/mcp",
      "/api/mcp",
      "/unsubscribe/abc",
      "/api/newsletter/unsubscribe/abc",
      "/api/site/orders",
      "/chat/website",
      "/widget/zx-chat.js",
      "/api/widget/session",
    ])
      expect(isZeronixOnlyPath(p), p).toBe(true);
    for (const p of ["/", "/accounts", "/accounts/payments", "/accounts/payroll-report", "/crm", "/crm/teams", "/crm/deals/1", "/admin", "/admin/users", "/chat", "/print/invoice/1", "/api/mcpx", "/platform"])
      expect(isZeronixOnlyPath(p), p).toBe(false);
  });

  it("leave the menus without their pages, unless the server says it is Zeronix's install", () => {
    const hrefs = (app: AppKey, zeronix: boolean) => navFor(app, { accountant: true, seesAll: true, zeronix }).flatMap((g) => g.items.map((i) => i.href));
    expect(hrefs("accounts", false)).not.toContain("/accounts/payroll");
    expect(hrefs("accounts", true)).toContain("/accounts/payroll");
    expect(hrefs("crm", false)).not.toContain("/crm/team");
    expect(hrefs("admin", false)).toEqual(expect.not.arrayContaining(["/admin/claude", "/admin/feeds"]));
    expect(hrefs("admin", false)).toContain("/admin/users");
    expect(hrefs("chat", false)).toEqual(["/chat"]);
    // a group whose only page is Zeronix's goes as a whole (CRM › Team, Accounts › People)
    expect(navFor("crm", { seesAll: true, zeronix: false }).map((g) => g.label)).not.toContain("Team");
  });
});

describe("an organisation's plan", () => {
  const all: AppKey[] = ["crm", "sales", "accounts", "procurement", "prospecting", "newsletter", "website", "mail", "admin"];

  it("on Zeronix's install: every app when no list is saved, else the list", () => {
    expect(planApps(all, null, true)).toEqual(all);
    expect(planApps(all, ["crm"], true)).toEqual(["crm", "admin"]);
  });

  it("in the SaaS install never goes beyond the core apps, even when a list or nothing is saved", () => {
    const core = new Set<string>(TENANT_CORE_APPS);
    expect(planApps(all, null, false)).toEqual(["crm", "sales", "accounts", "admin"]);
    expect(planApps(all, ["crm", "procurement", "website"], false)).toEqual(["crm", "admin"]);
    for (const a of planApps(all, null, false)) expect(core.has(a) || a === "admin").toBe(true);
  });
});
