/**
 * Supplier categories used in the UAE IT trade. The key is stored in the database, the rest is for
 * the screen. To add a category, add a row here (no migration needed).
 *
 * `basis` is the price basis such suppliers usually quote on: the same laptop can be 8% cheaper
 * from a free-zone supplier simply because the price excludes VAT or delivery.
 */
export interface SupplierType {
  key: string;
  label: string;
  short: string;
  description: string;
  currency: string;
  basis: string;
  /** Badge tint (tailwind classes, light + dark). */
  tone: string;
}

export const SUPPLIER_TYPES: SupplierType[] = [
  {
    key: "distributor",
    label: "Distributor",
    short: "Distributor",
    description: "Authorised distributor (Excel price list, SKU based, often FOB Jebel Ali, usually USD).",
    currency: "USD",
    basis: "FOB JA",
    tone: "bg-blue-500/15 text-blue-800 dark:text-blue-300",
  },
  {
    key: "big_stockist",
    label: "Big stockist",
    short: "Big stockist",
    description: "Large stock holder that sells in volume to the trade, ready stock, AED.",
    currency: "AED",
    basis: "",
    tone: "bg-violet-500/15 text-violet-800 dark:text-violet-300",
  },
  {
    key: "market",
    label: "Market trader",
    short: "Market",
    description: "Local market shop or trader (Deira, Bur Dubai, Naif, Al Fahidi, Ajman). WhatsApp lists, AED.",
    currency: "AED",
    basis: "",
    tone: "bg-amber-500/15 text-amber-900 dark:text-amber-300",
  },
  {
    key: "dafza",
    label: "DAFZA supplier",
    short: "DAFZA",
    description: "Dubai Airport Free Zone company. Free-zone prices, often ex-VAT, in AED or USD.",
    currency: "AED",
    basis: "ex-VAT",
    tone: "bg-sky-500/15 text-sky-800 dark:text-sky-300",
  },
  {
    key: "jafza",
    label: "JAFZA supplier",
    short: "JAFZA",
    description: "Jebel Ali Free Zone company. Free-zone prices, often ex-VAT or FOB Jebel Ali.",
    currency: "USD",
    basis: "ex-VAT",
    tone: "bg-teal-500/15 text-teal-800 dark:text-teal-300",
  },
  {
    key: "saif_zone",
    label: "SAIF Zone supplier",
    short: "SAIF",
    description: "Sharjah Airport International Free Zone company.",
    currency: "AED",
    basis: "ex-VAT",
    tone: "bg-cyan-500/15 text-cyan-800 dark:text-cyan-300",
  },
  {
    key: "other_freezone",
    label: "Other free zone",
    short: "Free zone",
    description: "DMCC, Dubai Silicon Oasis, Dubai South, Ajman, RAKEZ and other free zones.",
    currency: "AED",
    basis: "ex-VAT",
    tone: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300",
  },
  {
    key: "brand_direct",
    label: "Brand / OEM direct",
    short: "Brand",
    description: "Buying straight from the brand's UAE office or its online store.",
    currency: "AED",
    basis: "",
    tone: "bg-rose-500/15 text-rose-800 dark:text-rose-300",
  },
  {
    key: "other",
    label: "Other",
    short: "Other",
    description: "Anything that does not fit the categories above.",
    currency: "AED",
    basis: "",
    tone: "bg-muted text-muted-foreground",
  },
];

const BY_KEY = new Map(SUPPLIER_TYPES.map((t) => [t.key, t]));

export const SUPPLIER_TYPE_KEYS = SUPPLIER_TYPES.map((t) => t.key) as [string, ...string[]];

/** Unknown / legacy values fall back to "Other" so a typo in the database never breaks a page. */
export function supplierType(key: string | null | undefined): SupplierType {
  return BY_KEY.get(key ?? "") ?? BY_KEY.get("other")!;
}
