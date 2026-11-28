import type { AppKey, BusinessType } from "@/lib/apps";
import { STARTER_CATEGORIES, type StarterCategory } from "@/lib/items";

/**
 * Industries a company picks when it is set up. An industry is only a starting template: it suggests the business
 * type, the apps and the first item categories. After that the screens follow the company's apps and settings, never
 * the industry's name, so nothing in the portal branches on it (organizations.industry is kept for reference).
 */
export interface IndustryTemplate {
  key: string;
  label: string;
  hint: string;
  businessType: BusinessType;
  /** Apps suggested at set-up; the plan still decides which the company gets. Admin is always there. */
  apps: AppKey[];
  categories: readonly StarterCategory[];
}

const BASE: AppKey[] = ["crm", "sales", "accounts", "tasks", "files", "chat"];

export const INDUSTRIES = [
  {
    key: "it_trading",
    label: "IT and electronics trading",
    hint: "Laptops, networking, printers and their accessories, often with serial numbers",
    businessType: "trader",
    apps: [...BASE, "inventory"],
    categories: STARTER_CATEGORIES.trader,
  },
  {
    key: "general_trading",
    label: "General trading",
    hint: "Buying and selling goods from stock",
    businessType: "trader",
    apps: [...BASE, "inventory"],
    categories: [
      { name: "Products", kind: "goods", trackStock: true },
      { name: "Spare parts", kind: "goods", trackStock: true },
      { name: "Consumables", kind: "goods", trackStock: true },
      { name: "Delivery and handling", kind: "service", unit: "job" },
    ],
  },
  {
    key: "contracting",
    label: "Contracting and fit-out",
    hint: "Projects priced as a BOQ, with materials from stock and labour",
    businessType: "trader",
    apps: [...BASE, "projects", "inventory"],
    categories: [
      { name: "Materials", kind: "goods", trackStock: true },
      { name: "Electrical", kind: "goods", trackStock: true },
      { name: "Fixtures and fittings", kind: "goods", trackStock: true },
      { name: "Labour", kind: "service", unit: "day" },
      { name: "Subcontract work", kind: "service", unit: "job" },
    ],
  },
  {
    key: "maintenance",
    label: "Maintenance and facility services",
    hint: "Call-outs, annual contracts and planned visits",
    businessType: "services",
    apps: [...BASE, "projects"],
    categories: [
      { name: "Call-outs", kind: "service", unit: "visit" },
      { name: "Annual maintenance contracts", kind: "service", unit: "year" },
      { name: "Planned visits", kind: "service", unit: "visit" },
      { name: "Repairs", kind: "service", unit: "job" },
    ],
  },
  {
    key: "consulting",
    label: "Consulting and professional services",
    hint: "Advice, training and support, billed by the hour, day or month",
    businessType: "services",
    apps: BASE,
    categories: STARTER_CATEGORIES.services,
  },
  {
    key: "agency",
    label: "Agency (marketing, events, IT services)",
    hint: "Client projects, retainers and production work",
    businessType: "services",
    apps: [...BASE, "projects"],
    categories: [
      { name: "Design", kind: "service", unit: "job" },
      { name: "Production", kind: "service", unit: "job" },
      { name: "Retainers", kind: "service", unit: "month" },
      { name: "Media and printing", kind: "service", unit: "job" },
    ],
  },
] as const satisfies readonly IndustryTemplate[];

export type IndustryKey = (typeof INDUSTRIES)[number]["key"];

export const INDUSTRY_KEYS = INDUSTRIES.map((i) => i.key) as IndustryKey[];

export function industryByKey(key: string | null | undefined): IndustryTemplate | undefined {
  return INDUSTRIES.find((i) => i.key === key);
}

/** The apps an industry suggests, within what the plan allows (admin always stays). */
export function industryApps(key: string, allowed: readonly AppKey[]): AppKey[] {
  const t = industryByKey(key);
  if (!t) return [...allowed];
  return t.apps.filter((a) => allowed.includes(a));
}
