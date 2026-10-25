import { describe, expect, it } from "vitest";
import { allowedApps, APPS, canOpen, GRANTABLE_APPS, isAppKey } from "@/lib/apps";

describe("allowedApps", () => {
  it("gives admins every app, whatever list is saved", () => {
    expect(allowedApps({ role: "admin" })).toEqual(APPS.map((a) => a.key));
    expect(allowedApps({ role: "admin", apps: ["tasks"] })).toEqual(APPS.map((a) => a.key));
  });

  it("gives sales the role defaults when no list is saved", () => {
    const keys = allowedApps({ role: "sales", apps: null });
    expect(keys).toContain("procurement");
    expect(keys).toContain("crm");
    expect(keys).not.toContain("admin");
    expect(keys).toContain("accounts"); // quotes and orders; the finance level is a separate switch
  });

  it("uses the admin's explicit list for a sales user, in registry order", () => {
    expect(allowedApps({ role: "sales", apps: ["tasks", "procurement"] })).toEqual(["procurement", "tasks"]);
    expect(allowedApps({ role: "sales", apps: [] })).toEqual([]);
  });

  it("never lets a sales user into admin, even if the list says so", () => {
    expect(allowedApps({ role: "sales", apps: ["admin", "procurement"] })).toEqual(["procurement"]);
    expect(canOpen({ role: "sales", apps: ["admin"] }, "admin")).toBe(false);
  });

  it("ignores unknown keys", () => {
    expect(allowedApps({ role: "sales", apps: ["nope", "tasks"] })).toEqual(["tasks"]);
    expect(isAppKey("nope")).toBe(false);
    expect(isAppKey("crm")).toBe(true);
    expect(isAppKey("sales")).toBe(false);
  });

  it("does not offer the admin app as a per-user toggle", () => {
    expect(GRANTABLE_APPS.map((a) => a.key)).not.toContain("admin");
  });
});
