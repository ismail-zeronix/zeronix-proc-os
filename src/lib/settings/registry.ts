import type { AppKey } from "@/lib/apps";
import type { SettingKey } from "@/lib/settings";

/**
 * Every settings screen in the portal, and where it lives. Three levels:
 * - Admin › Settings: the company itself (identity, tax number, business type, work hours, notifications) and what
 *   every app that prints for customers shares (templates, letterhead, numbering).
 * - ‹App› › Settings: how that one app works. A company that does not use the app never sees its settings.
 * - The platform console (SaaS only): plan, apps and limits.
 * A section shows only when the company has its app (and any app in `need.apps`), the person may change it, and it fits
 * the business type and the install (Zeronix's own features are off in the SaaS). Setting keys never move with their
 * screens; old addresses redirect (next.config.ts).
 */
export interface SettingsSection {
  key: string;
  /** The app whose Settings shows this section (admin = Admin › Settings). */
  home: AppKey;
  /** Heading above it in the settings tree. */
  group: string;
  label: string;
  hint: string;
  href: string;
  /** Who may open and change it: admins, or accountants (admins count as accountants). */
  editBy: "admin" | "accountant";
  /** The keys of the settings table this screen edits (others live in their own tables). */
  keys?: SettingKey[];
  need?: {
    /** At least one of these apps (for settings several apps share, such as the printed documents). */
    apps?: AppKey[];
    /** Only for traders (stock). */
    trader?: boolean;
    /** Zeronix's own features (off in the SaaS install, lib/edition.ts). */
    zeronix?: boolean;
  };
}

const PRINTING_APPS: AppKey[] = ["sales", "accounts", "projects"];

export const SETTINGS_SECTIONS: SettingsSection[] = [
  // Admin › Settings: the company
  { key: "company", home: "admin", group: "Company", label: "Company & branding", hint: "Business type, tax number, logo and colours", href: "/admin/settings/company", editBy: "admin", keys: ["quote_trn"] },
  { key: "hours", home: "admin", group: "Company", label: "Work hours", hint: "Punch-in window, break and days off", href: "/admin/settings/hours", editBy: "admin", keys: ["work_start", "work_end", "work_break_start", "work_break_end", "work_off_days"] },
  { key: "notifications", home: "admin", group: "Company", label: "Notifications", hint: "Alerts, their priorities and the morning email", href: "/admin/settings/notifications", editBy: "admin", keys: ["notify_rules", "notify_digest_from"] },
  { key: "templates", home: "admin", group: "Documents", label: "Templates", hint: "How quotes, invoices and notes look", href: "/admin/settings/templates", editBy: "admin", need: { apps: PRINTING_APPS }, keys: ["doc_style"] },
  { key: "letterhead", home: "admin", group: "Documents", label: "Letterhead", hint: "Contact lines, white logo, signature and stamp", href: "/admin/settings/letterhead", editBy: "admin", need: { apps: PRINTING_APPS } },
  { key: "numbering", home: "admin", group: "Documents", label: "Document numbers", hint: "Invoice series and the other documents", href: "/admin/settings/numbering", editBy: "admin", need: { apps: ["sales", "accounts"] }, keys: ["invoice_prefix", "invoice_next_number", "invoice_digits"] },
  { key: "apps", home: "admin", group: "Apps", label: "App settings", hint: "The settings of each app you use", href: "/admin/settings/apps", editBy: "admin" },

  // Sales
  { key: "quotes", home: "sales", group: "Quotes", label: "Quote defaults", hint: "Margin, validity, VAT, terms and the quote email", href: "/sales/settings/quotes", editBy: "admin", keys: ["quote_margin_pct", "quote_valid_days", "quote_vat_pct", "quote_terms", "quote_email_subject", "quote_email_body"] },
  { key: "terms", home: "sales", group: "Orders", label: "Credit terms", hint: "The credit terms a new sale starts with", href: "/sales/settings/terms", editBy: "admin", keys: ["default_terms_days"] },

  // CRM
  { key: "targets", home: "crm", group: "Sales team", label: "Targets and check-ins", hint: "Daily and weekly targets, and how often to ask what was done", href: "/crm/settings/targets", editBy: "admin", need: { zeronix: true }, keys: ["sales_targets", "checkin_minutes"] },

  // Projects
  { key: "project-types", home: "projects", group: "Projects", label: "Project types", hint: "Kinds of work, their BOQ sections and task lists", href: "/projects/settings/types", editBy: "admin" },

  // Procurement (Zeronix's own app)
  { key: "comparison", home: "procurement", group: "Prices", label: "Price comparison", hint: "When a supplier price counts as old, and the dollar rate", href: "/procurement/settings/comparison", editBy: "admin", keys: ["stale_days", "fx_usd"] },

  // Accounts (accountants)
  { key: "vat", home: "accounts", group: "Company and tax", label: "VAT period", hint: "How often VAT is filed, and the TRN it is filed under", href: "/accounts/settings/vat", editBy: "accountant" },
  { key: "tax-codes", home: "accounts", group: "Company and tax", label: "Tax codes", hint: "VAT codes and their return boxes", href: "/accounts/settings/tax-codes", editBy: "accountant" },
  { key: "books", home: "accounts", group: "Books", label: "Financial year and lock date", hint: "When the year starts, and closing past periods", href: "/accounts/settings/books", editBy: "accountant" },
  { key: "opening", home: "accounts", group: "Books", label: "Opening balances", hint: "Cut-over date and balances from the old system", href: "/accounts/settings/opening", editBy: "accountant" },
  { key: "bank", home: "accounts", group: "Bank and cash", label: "Bank and cash accounts", hint: "Add accounts, pick the default for each method", href: "/accounts/settings/bank", editBy: "accountant" },
  { key: "default-accounts", home: "accounts", group: "Default accounts", label: "Posting accounts", hint: "Where each sales type and expense category posts", href: "/accounts/settings/default-accounts", editBy: "accountant" },

  // Inventory (traders)
  { key: "stock", home: "inventory", group: "Stock", label: "Stock policy", hint: "Selling more than you have, and when stock starts", href: "/inventory/settings", editBy: "accountant", need: { trader: true } },

  // Zeronix's own apps that keep their settings on one page
  { key: "prospecting", home: "prospecting", group: "Prospecting", label: "Prospecting settings", hint: "Sources, segments and the do-not-contact list", href: "/prospecting/settings", editBy: "admin" },
  { key: "website", home: "website", group: "Website", label: "Website settings", hint: "zeronixtech.com: shop, contact details and search", href: "/website/settings", editBy: "admin" },
];

/** Who is looking: the company's apps as this person has them, and what they may do. */
export interface SettingsViewer {
  apps: AppKey[];
  admin: boolean;
  accountant: boolean;
  trader: boolean;
  /** Zeronix's own install (lib/edition.ts zeronixFeatures()). */
  zeronix: boolean;
}

export function canSeeSection(s: SettingsSection, v: SettingsViewer): boolean {
  if (s.home !== "admin" && !v.apps.includes(s.home)) return false;
  if (s.home === "admin" && !v.admin) return false;
  if (s.editBy === "admin" ? !v.admin : !v.accountant) return false;
  if (s.need?.apps && !s.need.apps.some((a) => v.apps.includes(a))) return false;
  if (s.need?.trader && !v.trader) return false;
  if (s.need?.zeronix && !v.zeronix) return false;
  return true;
}

/** The sections this person sees, for one app's Settings (or all of them). */
export function sectionsFor(v: SettingsViewer, home?: AppKey): SettingsSection[] {
  return SETTINGS_SECTIONS.filter((s) => (!home || s.home === home) && canSeeSection(s, v));
}

/** The apps (besides Admin) whose Settings this person may open: their sidebars show a Settings item. */
export function settingsApps(v: SettingsViewer): AppKey[] {
  return [...new Set(sectionsFor(v).map((s) => s.home))];
}

export function sectionByKey(key: string): SettingsSection {
  const s = SETTINGS_SECTIONS.find((x) => x.key === key);
  if (!s) throw new Error(`No settings section "${key}"`);
  return s;
}

/** The settings tree for one app: its sections under their group headings, in the order above. */
export function settingsFolders(sections: SettingsSection[]): { label: string; items: { key: string; label: string; hint: string; href: string }[] }[] {
  const folders: { label: string; items: { key: string; label: string; hint: string; href: string }[] }[] = [];
  for (const s of sections) {
    let f = folders.find((x) => x.label === s.group);
    if (!f) folders.push((f = { label: s.group, items: [] }));
    f.items.push({ key: s.href, label: s.label, hint: s.hint, href: s.href });
  }
  return folders;
}
