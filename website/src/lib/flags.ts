/**
 * Switches for what is built but not live yet. The shop (WEBSITE-PLAN.md section 11) stays hidden until
 * COMMERCE_ENABLED=true; search engines may index the site only once SITE_INDEXING=true (go-live).
 */
export const flags = {
  commerce: process.env.COMMERCE_ENABLED === "true",
  indexing: process.env.SITE_INDEXING === "true",
};
