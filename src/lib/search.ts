import { sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { getFx, toAed, type Fx } from "@/lib/fx";
import { norm } from "@/lib/parse/match";

export interface SearchParams {
  q?: string;
  category?: string;
  brand?: string;
  supplierId?: number;
  /** Supplier category key (distributor, market, dafza ...). */
  supplierType?: string;
  ramGb?: number;
  pricedOnly?: boolean;
  /** Hide offers that are on order, out of stock or allocation only. */
  readyOnly?: boolean;
  latestOnly?: boolean;
  maxAgeDays?: number;
  productId?: number;
  limit?: number;
  sort?: SortKey;
}

export type SortKey = "suppliers" | "price" | "recent" | "spread";

export interface OfferHit {
  id: number;
  supplierId: number;
  supplierName: string;
  supplierType: string;
  price: number | null;
  currency: string;
  /** Price converted to AED, null when the currency has no rate. Used to rank across currencies. */
  priceAed: number | null;
  /** What the price is quoted on: "FOB JA", "ex-VAT" ... empty means as quoted. */
  priceBasis: string;
  /** This supplier's previous quote for the same product (same currency), for trend arrows. */
  prevPrice: number | null;
  receivedAt: string;
  stockNote: string;
  cpu: string;
  ramGb: number | null;
  storage: string;
  display: string;
  gpu: string;
  os: string;
  extras: string;
  condition: string;
  rawText: string;
  priceListId: number;
  stale: boolean;
}

export interface ProductHit {
  id: number;
  label: string;
  brand: string;
  modelName: string;
  partNumber: string;
  category: string;
  specSummary: string;
  /** Cheapest fresh price. In AED whenever the offers can be converted, so USD and AED rank together. */
  bestPrice: number | null;
  bestCurrency: string | null;
  /** The offer that holds the best price. */
  bestOfferId: number | null;
  /** Dearest fresh price in the same unit as bestPrice: how much a wrong supplier choice costs. */
  worstPrice: number | null;
  latestAt: string;
  offers: OfferHit[];
}

const SORTS: SortKey[] = ["suppliers", "price", "recent", "spread"];

/** Reads the shared compare filters from a URL (used by the search and export endpoints). */
export function searchParamsFrom(sp: URLSearchParams): SearchParams {
  const num = (v: string | null) => (v && Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : undefined);
  const sort = sp.get("sort") as SortKey | null;
  return {
    q: sp.get("q")?.slice(0, 200) ?? "",
    category: sp.get("category") || undefined,
    brand: sp.get("brand") || undefined,
    supplierId: num(sp.get("supplier")),
    supplierType: sp.get("type") || undefined,
    ramGb: num(sp.get("ram")),
    pricedOnly: sp.get("priced") === "1",
    readyOnly: sp.get("ready") === "1",
    latestOnly: sp.get("history") !== "1",
    maxAgeDays: num(sp.get("days")),
    sort: sort && SORTS.includes(sort) ? sort : undefined,
    limit: Math.min(num(sp.get("limit")) ?? 60, 300),
  };
}

/** "core 7 150u" ->["core7", "150u"]: short bare numbers stick to the word before them. */
export function searchTerms(q: string): string[] {
  const out: string[] = [];
  for (const raw of q.split(/\s+/)) {
    const t = norm(raw);
    if (!t) continue;
    if (/^\d{1,2}$/.test(t) && out.length && !/\d$/.test(out[out.length - 1])) out[out.length - 1] += t;
    else out.push(t);
  }
  return out;
}

type Row = {
  id: number;
  product_id: number;
  supplier_id: number;
  supplier_name: string;
  supplier_type: string;
  price_basis: string;
  price: string | null;
  currency: string;
  prev_price: string | null;
  prev_currency: string | null;
  received_at: Date;
  stock_note: string;
  cpu: string;
  ram_gb: number | null;
  storage: string;
  display: string;
  gpu: string;
  os: string;
  extras: string;
  condition: string;
  raw_text: string;
  price_list_id: number;
  p_brand: string;
  p_model: string;
  p_part: string;
  p_category: string;
  p_spec: string;
};

async function query(p: SearchParams, fuzzy: boolean): Promise<Row[]> {
  const where: SQL[] = [sql`true`];
  const terms = searchTerms(p.q ?? "");
  if (terms.length && !fuzzy) {
    for (const t of terms) where.push(sql`o.search_norm LIKE ${"%" + t + "%"}`);
  }
  if (terms.length && fuzzy) where.push(sql`word_similarity(${terms.join("")}, o.search_norm) > 0.35`);
  if (p.category) where.push(sql`o.category = ${p.category}`);
  if (p.brand) where.push(sql`lower(o.brand) = lower(${p.brand})`);
  if (p.supplierId) where.push(sql`o.supplier_id = ${p.supplierId}`);
  if (p.supplierType) where.push(sql`s.type = ${p.supplierType}`);
  if (p.ramGb) where.push(sql`o.ram_gb = ${p.ramGb}`);
  if (p.pricedOnly) where.push(sql`o.price IS NOT NULL`);
  if (p.readyOnly) where.push(sql`NOT (o.stock_note ~* 'on order|out of stock|allocation|pre-?order|\\yeta\\y')`);
  if (p.maxAgeDays) where.push(sql`o.received_at > now() - make_interval(days => ${p.maxAgeDays})`);
  if (p.productId) where.push(sql`o.product_id = ${p.productId}`);

  const res = await db.execute<Row & { rn: number }>(sql`
    WITH hits AS (
      SELECT o.*, s.name AS supplier_name, s.type AS supplier_type,
        p.brand AS p_brand, p.model_name AS p_model, p.part_number AS p_part,
        p.category AS p_category, p.spec_summary AS p_spec,
        row_number() OVER w AS rn,
        lead(o.price) OVER w AS prev_price,
        lead(o.currency) OVER w AS prev_currency
      FROM offers o
      JOIN suppliers s ON s.id = o.supplier_id
      JOIN products p ON p.id = o.product_id
      WHERE ${sql.join(where, sql` AND `)}
      WINDOW w AS (PARTITION BY o.product_id, o.supplier_id ORDER BY o.received_at DESC, o.id DESC)
    )
    SELECT * FROM hits
    ${p.latestOnly === false ? sql`` : sql`WHERE rn = 1`}
    ORDER BY received_at DESC
    LIMIT 3000`);
  return res.rows;
}

export async function searchOffers(p: SearchParams, staleDays = 14) {
  let rows = await query(p, false);
  let fuzzy = false;
  if (!rows.length && p.q?.trim()) {
    rows = await query(p, true);
    fuzzy = rows.length > 0;
  }

  const fx: Fx = await getFx();
  const staleBefore = Date.now() - staleDays * 86400_000;
  const byProduct = new Map<number, ProductHit>();
  for (const r of rows) {
    let ph = byProduct.get(r.product_id);
    if (!ph) {
      ph = {
        id: r.product_id,
        label: [r.p_brand, r.p_model, r.p_part].filter(Boolean).join(" "),
        brand: r.p_brand,
        modelName: r.p_model,
        partNumber: r.p_part,
        category: r.p_category,
        specSummary: r.p_spec,
        bestPrice: null,
        bestCurrency: null,
        bestOfferId: null,
        worstPrice: null,
        latestAt: new Date(r.received_at).toISOString(),
        offers: [],
      };
      byProduct.set(r.product_id, ph);
    }
    const receivedAt = new Date(r.received_at);
    ph.offers.push({
      id: r.id,
      supplierId: r.supplier_id,
      supplierName: r.supplier_name,
      supplierType: r.supplier_type,
      price: r.price == null ? null : Number(r.price),
      currency: r.currency,
      priceAed: toAed(r.price == null ? null : Number(r.price), r.currency, fx),
      priceBasis: r.price_basis,
      prevPrice: r.prev_price != null && r.prev_currency === r.currency ? Number(r.prev_price) : null,
      receivedAt: receivedAt.toISOString(),
      stockNote: r.stock_note,
      cpu: r.cpu,
      ramGb: r.ram_gb,
      storage: r.storage,
      display: r.display,
      gpu: r.gpu,
      os: r.os,
      extras: r.extras,
      condition: r.condition,
      rawText: r.raw_text,
      priceListId: r.price_list_id,
      stale: receivedAt.getTime() < staleBefore,
    });
  }

  const products = [...byProduct.values()];
  for (const ph of products) {
    // fresh offers first, cheapest first (in AED, so USD and AED mix), "price on request" last
    const rank = (o: OfferHit) => o.priceAed ?? o.price ?? Infinity;
    ph.offers.sort(
      (a, b) => Number(a.stale) - Number(b.stale) || rank(a) - rank(b) || b.receivedAt.localeCompare(a.receivedAt),
    );
    const priced = ph.offers.filter((o) => o.price != null && !o.stale);
    const pool = priced.length ? priced : ph.offers.filter((o) => o.price != null);
    // compare in AED when possible; a currency without a rate only competes with itself
    const convertible = pool.filter((o) => o.priceAed != null);
    if (convertible.length) {
      const best = convertible.reduce((a, b) => (b.priceAed! < a.priceAed! ? b : a));
      ph.bestPrice = best.priceAed;
      ph.bestCurrency = "AED";
      ph.bestOfferId = best.id;
      ph.worstPrice = Math.max(...convertible.map((o) => o.priceAed!));
    } else if (pool.length) {
      const best = pool.reduce((a, b) => (b.price! < a.price! ? b : a));
      ph.bestPrice = best.price;
      ph.bestCurrency = best.currency;
      ph.bestOfferId = best.id;
      ph.worstPrice = Math.max(...pool.filter((o) => o.currency === best.currency).map((o) => o.price as number));
    }
  }
  const suppliersOf = (p: ProductHit) => new Set(p.offers.map((o) => o.supplierId)).size;
  const spreadOf = (p: ProductHit) => (p.bestPrice != null && p.worstPrice != null ? p.worstPrice - p.bestPrice : -1);
  const recent = (a: ProductHit, b: ProductHit) => b.latestAt.localeCompare(a.latestAt);
  // default: products quoted by more suppliers first (that is what comparison is for), then most recent
  const sorters: Record<SortKey, (a: ProductHit, b: ProductHit) => number> = {
    suppliers: (a, b) => suppliersOf(b) - suppliersOf(a) || recent(a, b),
    price: (a, b) => (a.bestPrice ?? Infinity) - (b.bestPrice ?? Infinity) || recent(a, b),
    recent,
    spread: (a, b) => spreadOf(b) - spreadOf(a) || recent(a, b),
  };
  products.sort(sorters[p.sort ?? "suppliers"]);
  const limit = p.limit ?? 60;
  return { products: products.slice(0, limit), total: products.length, fuzzy };
}
