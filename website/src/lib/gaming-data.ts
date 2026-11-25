import "server-only";
import type { FinderBuild } from "@/components/gaming/game-finder";
import { getProduct } from "./api";
import type { SiteProductPage } from "./contract";
import { BUILDS, type BuildTier } from "./gaming";
import { formatPrice } from "./price";

export type LoadedBuild = { tier: BuildTier; product: SiteProductPage };

/** The Zeronix Custom PCs that are published in the catalog, in tier order (a missing or draft build is left out). */
export async function loadBuilds(): Promise<LoadedBuild[]> {
  const pages = await Promise.all(BUILDS.map((b) => getProduct(b.slug).catch(() => null)));
  return BUILDS.flatMap((tier, i) => (pages[i] ? [{ tier, product: pages[i] }] : []));
}

export const finderBuilds = (loaded: LoadedBuild[]): FinderBuild[] =>
  loaded.map(({ tier, product }) => ({ key: tier.key, name: tier.name, href: `/products/${product.categorySlug}/${product.slug}`, price: formatPrice(product.price, product.currency) }));
