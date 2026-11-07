/**
 * Customers, quotes and sales orders are one set of records with two ways in: the Sales app and the Accounts app. The
 * pages are shared, and links on them stay in the app the person came from.
 */
export type SalesBase = "/sales" | "/accounts";

export const salesBaseOf = (pathname: string): SalesBase => (pathname.startsWith("/accounts") ? "/accounts" : "/sales");

export const appTitle = (base: SalesBase) => (base === "/accounts" ? "Zeronix Accounts" : "Zeronix Sales");

/** One value from a page's search params. */
export const param = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
