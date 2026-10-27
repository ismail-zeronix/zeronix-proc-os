import type { NextConfig } from "next";

/** Procurement used to live at the site root; keep old bookmarks and shared links working. */
const MOVED_TO_PROCUREMENT = ["compare", "import", "alerts", "price-lists", "suppliers", "products"];

/**
 * October 2026: deals, companies and contacts moved from Sales to CRM; Sales keeps customers, quotes and orders (which
 * spent a day under Accounts). Old links in chat messages, emails and bookmarks still land on the right page.
 */
export const MOVED_FROM_SALES = [
  { source: "/sales/pipeline", destination: "/crm/deals" },
  { source: "/sales/deals/:path*", destination: "/crm/deals/:path*" },
  { source: "/sales/companies", destination: "/crm/companies" },
  { source: "/sales/companies/:path*", destination: "/crm/companies/:path*" },
  { source: "/sales/contacts", destination: "/crm/contacts" },
  { source: "/sales/new", destination: "/crm/new" },
  { source: "/accounts/quotes", destination: "/sales/quotes" },
  { source: "/accounts/quotes/:path*", destination: "/sales/quotes/:path*" },
  { source: "/accounts/orders", destination: "/sales/orders" },
  { source: "/accounts/orders/:path*", destination: "/sales/orders/:path*" },
  { source: "/accounts/customers", destination: "/sales/customers" },
  { source: "/accounts/customers/:path*", destination: "/sales/customers/:path*" },
];

const nextConfig: NextConfig = {
  // The Docker build sets NEXT_OUTPUT=standalone (small image, `node server.js`). Local `npm run build` / `npm start`
  // stay as they were: standalone output needs symlink rights on Windows and does not run under `next start`.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  poweredByHeader: false,
  // `npm run dev -- -H 0.0.0.0` serves the office LAN; without this, pages opened by IP load without their dev JS.
  allowedDevOrigins: ["192.168.*.*"],
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
