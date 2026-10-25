import type { NextConfig } from "next";

/** Procurement used to live at the site root; keep old bookmarks and shared links working. */
const MOVED_TO_PROCUREMENT = ["compare", "import", "alerts", "price-lists", "suppliers", "products"];

/**
 * Sales became CRM (deals, companies, contacts) and its quotes and orders moved to Accounts (October 2026). Old links in
 * chat messages, emails and bookmarks still land on the right page. Most specific first.
 */
export const MOVED_FROM_SALES = [
  { source: "/sales/quotes", destination: "/accounts/quotes" },
  { source: "/sales/quotes/:path*", destination: "/accounts/quotes/:path*" },
  { source: "/sales/orders", destination: "/accounts/orders" },
  { source: "/sales/orders/:path*", destination: "/accounts/orders/:path*" },
  { source: "/sales/pipeline", destination: "/crm/deals" },
  { source: "/sales", destination: "/crm" },
  { source: "/sales/:path*", destination: "/crm/:path*" },
  { source: "/accounts/to-invoice", destination: "/accounts/orders?view=delivered" },
];

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg", "pg-boss", "bcryptjs"],
  // The login gate (proxy.ts) buffers request bodies, 10 MB by default and silently cut off beyond that.
  // Email attachments (15 MB) and Excel price lists (15 MB) need more room.
  experimental: { proxyClientMaxBodySize: "20mb" },
  async redirects() {
    return [
      ...MOVED_TO_PROCUREMENT.flatMap((p) => [
        { source: `/${p}`, destination: `/procurement/${p}`, permanent: false },
        { source: `/${p}/:path*`, destination: `/procurement/${p}/:path*`, permanent: false },
      ]),
      ...MOVED_FROM_SALES.map((r) => ({ ...r, permanent: false })),
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
