/**
 * Chart-of-accounts templates a new organisation's books start from. Plain data, no database: ensureLedger()
 * (lib/ledger/setup.ts) copies a template into the accounts table and adds what a later version brings.
 *
 * systemKey marks the accounts the portal posts to by itself (receivables, VAT, the expense categories of
 * lib/purchases.ts as "exp_<category>"...). Codes follow the usual layout: 1 assets, 2 liabilities, 3 equity,
 * 4 income, 5 cost of sales, 6 expenses, 7 tax on profit.
 */
import type { CategoryKey } from "@/lib/purchases";

export type AccountType = "asset" | "liability" | "equity" | "income" | "expense";

export interface TemplateAccount {
  code: string;
  name: string;
  type: AccountType;
  subtype?: string;
  /** Code of the group it sits under. */
  parent?: string;
  group?: boolean;
  systemKey?: string;
  description?: string;
}

export interface CoaTemplate {
  key: string;
  label: string;
  /** Bump when accounts are added: existing books get the new ones (never renamed or removed ones). */
  version: number;
  accounts: readonly TemplateAccount[];
  /** Tax code → system keys of the accounts its tax posts to on sales (output) and purchases (input). */
  taxAccounts: Record<string, { sales?: string; purchase?: string }>;
}

const g = (code: string, name: string, type: AccountType, parent?: string): TemplateAccount => ({ code, name, type, parent, group: true });

/** UAE trading company (IT products, services and projects), IFRS layout, UAE VAT. */
export const AE_TRADING: CoaTemplate = {
  key: "ae-trading",
  label: "UAE trading company",
  version: 1,
  accounts: [
    g("1000", "Assets", "asset"),
    g("1100", "Cash and bank", "asset", "1000"),
    { code: "1110", name: "Cash in hand", type: "asset", subtype: "cash", parent: "1100", systemKey: "cash" },
    { code: "1120", name: "Petty cash", type: "asset", subtype: "cash", parent: "1100", systemKey: "petty_cash" },
    { code: "1150", name: "Bank", type: "asset", subtype: "bank", parent: "1100", systemKey: "bank" },
    g("1200", "Receivables", "asset", "1000"),
    { code: "1210", name: "Accounts receivable", type: "asset", subtype: "receivable", parent: "1200", systemKey: "ar", description: "What customers owe us on invoices" },
    { code: "1220", name: "Cheques in hand", type: "asset", subtype: "receivable", parent: "1200", systemKey: "cheques_in_hand", description: "Customer cheques received, not yet cleared" },
    { code: "1230", name: "Employee advances", type: "asset", subtype: "receivable", parent: "1200", systemKey: "employee_advances" },
    { code: "1240", name: "Advances to suppliers", type: "asset", subtype: "receivable", parent: "1200", systemKey: "supplier_advances", description: "Paid to suppliers before their bill" },
    g("1300", "Inventory", "asset", "1000"),
    { code: "1310", name: "Inventory", type: "asset", subtype: "inventory", parent: "1300", systemKey: "inventory", description: "Goods bought and not yet sold (moves to cost of goods sold when invoiced)" },
    { code: "1320", name: "Goods in transit", type: "asset", subtype: "inventory", parent: "1300", systemKey: "goods_in_transit" },
    g("1400", "Tax recoverable", "asset", "1000"),
    { code: "1410", name: "VAT input", type: "asset", subtype: "tax", parent: "1400", systemKey: "vat_input", description: "VAT on purchases we reclaim (VAT 201 box 9)" },
    { code: "1420", name: "VAT input, reverse charge", type: "asset", subtype: "tax", parent: "1400", systemKey: "vat_input_rc", description: "VAT we self-assess on imports and foreign services and reclaim (box 10)" },
    g("1500", "Prepayments and deposits", "asset", "1000"),
    { code: "1510", name: "Prepaid expenses", type: "asset", subtype: "prepaid", parent: "1500", systemKey: "prepaid" },
    { code: "1520", name: "Deposits", type: "asset", subtype: "other", parent: "1500", systemKey: "deposits", description: "Rent, visa and utility deposits" },
    g("1700", "Fixed assets", "asset", "1000"),
    { code: "1710", name: "IT equipment", type: "asset", subtype: "fixed_asset", parent: "1700" },
    { code: "1720", name: "Furniture and fittings", type: "asset", subtype: "fixed_asset", parent: "1700" },
    { code: "1730", name: "Vehicles", type: "asset", subtype: "fixed_asset", parent: "1700" },
    { code: "1790", name: "Accumulated depreciation", type: "asset", subtype: "fixed_asset", parent: "1700", systemKey: "accum_depreciation" },

    g("2000", "Liabilities", "liability"),
    g("2100", "Payables", "liability", "2000"),
    { code: "2110", name: "Accounts payable", type: "liability", subtype: "payable", parent: "2100", systemKey: "ap", description: "What we owe suppliers on bills" },
    { code: "2120", name: "Accrued expenses", type: "liability", subtype: "payable", parent: "2100", systemKey: "accrued" },
    { code: "2130", name: "Customer advances", type: "liability", subtype: "payable", parent: "2100", systemKey: "customer_advances", description: "Money received before the invoice" },
    { code: "2140", name: "Salaries payable", type: "liability", subtype: "payable", parent: "2100", systemKey: "salaries_payable" },
    g("2200", "Tax payable", "liability", "2000"),
    { code: "2210", name: "VAT output", type: "liability", subtype: "tax", parent: "2200", systemKey: "vat_output", description: "VAT charged on our sales (VAT 201 box 1)" },
    { code: "2220", name: "VAT output, reverse charge", type: "liability", subtype: "tax", parent: "2200", systemKey: "vat_output_rc", description: "VAT we self-assess on imports and foreign services (boxes 3 and 6)" },
    { code: "2230", name: "VAT payable to FTA", type: "liability", subtype: "tax", parent: "2200", systemKey: "vat_payable", description: "Net VAT of filed returns, until paid" },
    { code: "2240", name: "Corporate tax payable", type: "liability", subtype: "tax", parent: "2200", systemKey: "ct_payable" },
    g("2300", "Provisions", "liability", "2000"),
    { code: "2310", name: "End-of-service benefits", type: "liability", subtype: "provision", parent: "2300", systemKey: "eosb" },
    g("2400", "Loans and cards", "liability", "2000"),
    { code: "2410", name: "Owner / partner loan", type: "liability", subtype: "loan", parent: "2400", systemKey: "owner_loan" },
    { code: "2420", name: "Credit card", type: "liability", subtype: "credit_card", parent: "2400", systemKey: "credit_card" },
    { code: "2430", name: "Bank loan", type: "liability", subtype: "loan", parent: "2400" },

    g("3000", "Equity", "equity"),
    { code: "3100", name: "Share capital", type: "equity", parent: "3000", systemKey: "share_capital" },
    { code: "3200", name: "Owner current account", type: "equity", parent: "3000", systemKey: "owner_current", description: "Money the owner puts in or takes out" },
    { code: "3300", name: "Retained earnings", type: "equity", parent: "3000", systemKey: "retained_earnings" },
    { code: "3900", name: "Opening balance equity", type: "equity", parent: "3000", systemKey: "opening_equity", description: "Balancing figure of the opening balances: should be zero once they are complete" },

    g("4000", "Income", "income"),
    { code: "4100", name: "Sales, products", type: "income", subtype: "sales", parent: "4000", systemKey: "sales_products" },
    { code: "4200", name: "Sales, services and projects", type: "income", subtype: "sales", parent: "4000", systemKey: "sales_services" },
    { code: "4300", name: "Sales returns and discounts", type: "income", subtype: "sales", parent: "4000", systemKey: "sales_returns" },
    { code: "4800", name: "Other income", type: "income", subtype: "other_income", parent: "4000", systemKey: "other_income" },
    { code: "4900", name: "Foreign exchange gain", type: "income", subtype: "other_income", parent: "4000", systemKey: "fx_gain" },

    g("5000", "Cost of sales", "expense"),
    { code: "5100", name: "Cost of goods sold", type: "expense", subtype: "cogs", parent: "5000", systemKey: "cogs" },
    { code: "5200", name: "Project and subcontract costs", type: "expense", subtype: "cogs", parent: "5000", systemKey: "project_costs" },
    { code: "5300", name: "Freight and customs inward", type: "expense", subtype: "cogs", parent: "5000", systemKey: "freight_in" },

    g("6000", "Operating expenses", "expense"),
    { code: "6100", name: "Rent", type: "expense", parent: "6000", systemKey: "exp_rent" },
    { code: "6200", name: "Salaries and wages", type: "expense", parent: "6000", systemKey: "exp_salaries" },
    { code: "6210", name: "Visa and labour", type: "expense", parent: "6000", systemKey: "exp_visa" },
    { code: "6300", name: "Utilities", type: "expense", parent: "6000", systemKey: "exp_utilities" },
    { code: "6310", name: "Telephone and internet", type: "expense", parent: "6000", systemKey: "exp_telecom" },
    { code: "6400", name: "Fuel and transport", type: "expense", parent: "6000", systemKey: "exp_transport" },
    { code: "6500", name: "Marketing", type: "expense", parent: "6000", systemKey: "exp_marketing" },
    { code: "6600", name: "Office supplies", type: "expense", parent: "6000", systemKey: "exp_office" },
    { code: "6700", name: "Software and subscriptions", type: "expense", parent: "6000", systemKey: "exp_software" },
    { code: "6800", name: "Bank charges", type: "expense", parent: "6000", systemKey: "exp_bank" },
    { code: "6810", name: "Professional fees", type: "expense", parent: "6000", systemKey: "exp_fees" },
    { code: "6900", name: "Repairs and maintenance", type: "expense", parent: "6000", systemKey: "exp_repairs" },
    { code: "6950", name: "Depreciation", type: "expense", parent: "6000", systemKey: "depreciation" },
    { code: "6960", name: "Foreign exchange loss", type: "expense", parent: "6000", systemKey: "fx_loss" },
    { code: "6970", name: "Rounding differences", type: "expense", parent: "6000", systemKey: "rounding" },
    { code: "6990", name: "Other expenses", type: "expense", parent: "6000", systemKey: "exp_other" },

    g("7000", "Tax on profit", "expense"),
    { code: "7100", name: "Corporate tax", type: "expense", subtype: "tax", parent: "7000", systemKey: "ct_expense" },
  ],
  taxAccounts: {
    SR: { sales: "vat_output", purchase: "vat_input" },
    ZR: { sales: "vat_output", purchase: "vat_input" },
    EX: {},
    RC: { sales: "vat_output_rc", purchase: "vat_input_rc" },
    IM: { sales: "vat_output_rc", purchase: "vat_input_rc" },
    OS: {},
  },
};

const TEMPLATES: Record<string, CoaTemplate> = { [AE_TRADING.key]: AE_TRADING };

export function coaTemplate(key: string): CoaTemplate {
  const t = TEMPLATES[key];
  if (!t) throw new Error(`Unknown chart-of-accounts template "${key}"`);
  return t;
}

/** The account a purchases category (lib/purchases.ts) posts to. */
export const categorySystemKey = (category: CategoryKey | string): string => (category === "cogs" ? "cogs" : category === "services" ? "project_costs" : `exp_${category}`);

/** Debit-normal accounts (assets, expenses) grow with debits; the rest with credits. */
export const debitNormal = (type: AccountType): boolean => type === "asset" || type === "expense";

export const ACCOUNT_TYPES: readonly { key: AccountType; label: string; plural: string }[] = [
  { key: "asset", label: "Asset", plural: "Assets" },
  { key: "liability", label: "Liability", plural: "Liabilities" },
  { key: "equity", label: "Equity", plural: "Equity" },
  { key: "income", label: "Income", plural: "Income" },
  { key: "expense", label: "Expense", plural: "Expenses" },
];
export const accountTypeLabel = (t: string) => ACCOUNT_TYPES.find((x) => x.key === t)?.label ?? t;
