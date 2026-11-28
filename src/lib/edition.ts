/**
 * Zeronix's own features: built for the way Zeronix works (its sales team's routine, its payroll, its suppliers' WhatsApp
 * stock, its website and cold outreach, the Claude connector to its data, the import of its old Zoho documents). They
 * are part of the code on every install but are switched off in the SaaS install (MULTI_TENANT=true,
 * demo.zeronixos.online), where organisations get the core apps only (TENANT_CORE_APPS in lib/apps.ts).
 *
 * Whole apps (Outreach, Newsletters, Procurement, Website, Mail, Knowledge) are already kept out by the organisation's
 * plan. This file covers the Zeronix features that live inside the core apps, and their public addresses:
 *   - the proxy answers 404 for ZERONIX_ONLY_PATHS;
 *   - menus, home cards and punch-in/out leave them out (zeronixFeatures());
 *   - their server actions refuse (assertZeronixFeatures()), since an action can be called without its page.
 *
 * When Zeronix moves onto the multi-tenant install (Phase 8), this becomes a per-organisation switch.
 */

/** True on Zeronix's own install, false in the SaaS install. Safe in the proxy, the server and the browser bundle. */
export function zeronixFeatures(): boolean {
  return process.env.MULTI_TENANT !== "true";
}

/** For the server actions of a Zeronix-only feature. */
export function assertZeronixFeatures(): void {
  if (!zeronixFeatures()) throw new Error("This feature is not available on this account.");
}

/**
 * Addresses of Zeronix-only features. A prefix ends in "/" or is matched as the whole path or the start of a deeper one.
 */
export const ZERONIX_ONLY_PATHS = [
  // Accounts › Payroll and its printed payslip
  "/accounts/payroll",
  "/print/payslip",
  // the sales routine: CRM › Team
  "/crm/team",
  // Admin › Claude connector, Admin › Feeds (supplier price feeds for Procurement)
  "/admin/claude",
  "/admin/feeds",
  // the Claude connector's sign-in and MCP endpoints
  "/oauth/",
  "/api/oauth/",
  "/.well-known/oauth-",
  "/api/mcp",
  // newsletter unsubscribe links, and the public website's API (zeronixtech.com)
  "/unsubscribe/",
  "/api/newsletter/",
  "/api/site/",
  // the live chat on Zeronix's websites: Chat › Website chats, the widget script and its public endpoints
  "/chat/website",
  "/widget/",
  "/api/widget/",
];

export function isZeronixOnlyPath(pathname: string): boolean {
  return ZERONIX_ONLY_PATHS.some((p) =>
    p.endsWith("/") || p.endsWith("-") ? pathname.startsWith(p) : pathname === p || pathname.startsWith(p + "/"),
  );
}
