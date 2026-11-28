import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { navFor } from "@/lib/app-nav";
import type { AppKey } from "@/lib/apps";
import { SETTING_DEFAULTS, type SettingKey } from "@/lib/settings";
import { SETTINGS_SECTIONS, sectionsFor, settingsApps, settingsFolders, type SettingsViewer } from "@/lib/settings/registry";

const page = (href: string) => path.join(process.cwd(), "src/app/(app)", ...href.split("/").filter(Boolean), "page.tsx");

/** Settings kept elsewhere on purpose: changed where they are used, or written by the system. */
const IN_PLACE: Partial<Record<SettingKey, string>> = {
  webchat_ring: "Chat › Website chats (Zeronix)",
  newsletter_cooloff_days: "Outreach › Newsletters (Zeronix)",
  notify_digest_day: "written by the worker: the day the morning digest last went",
  notify_team_day: "written by the worker: the day the team email last went",
  bank_name: "old printed bank details, copied into Bank and cash accounts",
  bank_account_name: "old printed bank details",
  bank_account_number: "old printed bank details",
  bank_iban: "old printed bank details",
  bank_swift: "old printed bank details",
};

const viewer = (p: Partial<SettingsViewer> & { apps: AppKey[] }): SettingsViewer => ({ admin: true, accountant: true, trader: false, zeronix: false, ...p });

describe("the settings registry", () => {
  it("points every section at a page that exists, under its own app (or Admin)", () => {
    for (const s of SETTINGS_SECTIONS) {
      expect(existsSync(page(s.href)), `${s.key}: ${s.href}`).toBe(true);
      expect(s.href.startsWith(`/${s.home}/`) || s.href === `/${s.home}/settings`, `${s.key} lives under /${s.home}`).toBe(true);
    }
    expect(new Set(SETTINGS_SECTIONS.map((s) => s.key)).size).toBe(SETTINGS_SECTIONS.length);
  });

  it("gives every setting a screen, or says why it has none", () => {
    const shown = new Set(SETTINGS_SECTIONS.flatMap((s) => s.keys ?? []));
    for (const key of Object.keys(SETTING_DEFAULTS) as SettingKey[]) expect(shown.has(key) || key in IN_PLACE, `setting ${key} has no screen`).toBe(true);
  });

  it("shows a CRM + Sales service company nothing of Accounts, Inventory or Zeronix, and keeps the shared documents in Admin", () => {
    const v = viewer({ apps: ["crm", "sales", "admin"] });
    const all = sectionsFor(v);
    expect(all.some((s) => s.href.startsWith("/accounts/") || s.href.startsWith("/inventory/") || s.href.startsWith("/procurement/"))).toBe(false);
    expect(all.map((s) => s.key)).toEqual(expect.arrayContaining(["company", "templates", "letterhead", "numbering", "quotes", "terms"]));
    // CRM's only screen is Zeronix's sales routine
    expect(sectionsFor(v, "crm")).toEqual([]);
    expect(settingsApps(v)).toEqual(expect.arrayContaining(["admin", "sales"]));
    expect(settingsApps(v)).not.toContain("crm");
    // the sidebar follows: Sales shows Settings, CRM does not
    const groups = (app: AppKey) => navFor(app, { settingsApps: settingsApps(v) }).map((g) => g.label);
    expect(groups("sales")).toContain("Setup");
    expect(groups("crm")).not.toContain("Setup");
  });

  it("keeps the printed-document settings away from a company that prints nothing", () => {
    const keys = sectionsFor(viewer({ apps: ["crm", "tasks", "admin"] })).map((s) => s.key);
    expect(keys).not.toContain("templates");
    expect(keys).not.toContain("numbering");
    expect(keys).toContain("company");
  });

  it("shows Zeronix's own screens only on Zeronix's install, and stock only to traders", () => {
    const apps: AppKey[] = ["crm", "sales", "accounts", "inventory", "procurement", "admin"];
    expect(sectionsFor(viewer({ apps, zeronix: false })).some((s) => s.need?.zeronix)).toBe(false);
    expect(sectionsFor(viewer({ apps, zeronix: true })).map((s) => s.key)).toContain("targets");
    expect(sectionsFor(viewer({ apps, trader: false }), "inventory")).toEqual([]);
    expect(sectionsFor(viewer({ apps, trader: true }), "inventory").map((s) => s.key)).toEqual(["stock"]);
  });

  it("lets only admins into Admin settings, and accountants into Accounts settings", () => {
    const accountant = viewer({ apps: ["sales", "accounts"], admin: false, accountant: true });
    expect(sectionsFor(accountant, "admin")).toEqual([]);
    expect(sectionsFor(accountant, "sales")).toEqual([]);
    expect(sectionsFor(accountant, "accounts").length).toBeGreaterThan(3);
    const user = viewer({ apps: ["sales", "accounts"], admin: false, accountant: false });
    expect(sectionsFor(user)).toEqual([]);
    expect(navFor("accounts", { settingsApps: settingsApps(user) }).map((g) => g.label)).not.toContain("Settings");
  });

  it("builds the settings tree in the order of the registry, one folder per group", () => {
    const folders = settingsFolders(sectionsFor(viewer({ apps: ["sales", "accounts", "admin"] }), "admin"));
    expect(folders.map((f) => f.label)).toEqual(["Company", "Documents", "Apps"]);
    expect(folders[1].items.map((i) => i.label)).toEqual(["Templates", "Letterhead", "Document numbers"]);
  });
});
