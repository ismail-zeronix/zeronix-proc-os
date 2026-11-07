/** Accounting settings with no database, shared by the server actions, the pages and the tests. */
import { CATEGORIES } from "@/lib/purchases";
import { categorySystemKey } from "./coa-templates";

export type BankKind = "bank" | "cash" | "card" | "petty";

/** Which payment method an account is picked for: a cash box or petty cash for cash, a bank or card for transfers. */
export const paymentMethodOf = (kind: string): "cash" | "bank" => (kind === "cash" || kind === "petty" ? "cash" : "bank");

export const BANK_KIND_LABELS: Record<BankKind, string> = { bank: "Bank account", cash: "Cash box", petty: "Petty cash", card: "Company card" };

/**
 * What an accountant may point at another account. Goods go through Inventory and cost of goods sold, which the closing
 * stock and the reports rely on, so they stay where they are; so do the control accounts (customers, suppliers, VAT).
 */
export const MAPPABLE_KEYS: readonly { key: string; label: string; type: "income" | "expense"; group: string }[] = [
  { key: "sales_products", label: "Sales of products", type: "income", group: "Sales" },
  { key: "sales_services", label: "Sales of services", type: "income", group: "Sales" },
  ...CATEGORIES.filter((c) => c.key !== "cogs").map((c) => ({ key: categorySystemKey(c.key), label: c.label, type: "expense" as const, group: "Costs and expenses" })),
];

export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"] as const;
