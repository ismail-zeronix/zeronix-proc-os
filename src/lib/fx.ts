import { sql, type SQL } from "drizzle-orm";
import { DEFAULT_FX, type Fx } from "@/lib/currency";
import { getSetting } from "@/lib/settings";

// the pure parts live in lib/currency so client components can use them without the database
export { CURRENCIES, DEFAULT_FX, toAed, type Fx } from "@/lib/currency";

export async function getFx(): Promise<Fx> {
  const usd = Number(await getSetting("fx_usd"));
  return { usd: Number.isFinite(usd) && usd > 0 ? usd : DEFAULT_FX.usd };
}

/** SQL twin of `toAed`, so ranking and "best price" can be done in the database. */
export function aedSql(price: SQL | string, currency: SQL | string, fx: Fx): SQL {
  const p = typeof price === "string" ? sql.raw(price) : price;
  const c = typeof currency === "string" ? sql.raw(currency) : currency;
  return sql`(CASE upper(${c}) WHEN 'AED' THEN ${p} WHEN 'USD' THEN ${p} * ${fx.usd} ELSE NULL END)`;
}
