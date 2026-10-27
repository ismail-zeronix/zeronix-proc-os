import { BarChart3, Inbox, Landmark, TriangleAlert, Bell, FolderKanban, Bot, Building2, ClipboardList, FileText, HandCoins, History, Kanban, LayoutDashboard, Receipt, ReceiptText, Search, SlidersHorizontal, Truck, Users, UsersRound, Wallet, type LucideIcon } from "lucide-react";
import type { AppKey } from "./apps";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Name of a number in the `badges` map handed to the sidebar. */
  badge?: string;
  /** Match only this exact path (for an app's overview page). */
  exact?: boolean;
  /** Other paths whose pages (`/procurement/import/3`) belong to this item, so it stays lit there. */
  also?: string[];
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/** Sidebar pages per app. Apps without an entry have no sidebar (single-page apps). */
export const APP_NAV: Partial<Record<AppKey, NavGroup[]>> = {
  crm: [
    {
      label: "Work",
      items: [
        { href: "/crm", label: "Overview", icon: LayoutDashboard, exact: true },
        { href: "/crm/leads", label: "Leads", icon: Inbox, also: ["/crm/new"] },
        { href: "/crm/deals", label: "Deals", icon: Kanban },
      ],
    },
    {
      label: "People",
      items: [
        { href: "/crm/companies", label: "Companies", icon: Building2 },
        { href: "/crm/contacts", label: "Contacts", icon: Users },
      ],
    },
  ],
  projects: [
    {
      label: "Work",
      items: [
        { href: "/projects", label: "Overview", icon: LayoutDashboard, exact: true },
        { href: "/projects/list", label: "Projects", icon: FolderKanban, badge: "projOverdue" },
      ],
    },
  ],
  procurement: [
    {
      label: "Work",
      items: [
        { href: "/procurement", label: "Overview", icon: LayoutDashboard, exact: true },
        { href: "/procurement/compare", label: "Compare prices", icon: Search, also: ["/procurement/products"] },
        { href: "/procurement/price-lists", label: "Price lists", icon: History, badge: "review", also: ["/procurement/import"] },
      ],
    },
    {
      label: "Track",
      items: [
        { href: "/procurement/alerts", label: "Price alerts", icon: Bell, badge: "alerts" },
        { href: "/procurement/suppliers", label: "Suppliers", icon: Truck },
      ],
    },
  ],
  sales: [
    {
      label: "Sales",
      items: [
        { href: "/sales", label: "Overview", icon: LayoutDashboard, exact: true },
        { href: "/sales/customers", label: "Customers", icon: UsersRound },
        { href: "/sales/quotes", label: "Quotes", icon: FileText, also: ["/sales/quotes/new"] },
        { href: "/sales/orders", label: "Sales orders", icon: ClipboardList },
      ],
    },
  ],
  accounts: [
    {
      label: "Money in",
      items: [
        { href: "/accounts", label: "Overview", icon: LayoutDashboard, exact: true },
        { href: "/accounts/to-invoice", label: "To invoice", icon: Landmark, badge: "toInvoice" },
        { href: "/accounts/invoices", label: "Invoices", icon: Receipt, badge: "overdue" },
        { href: "/accounts/payments", label: "Payments received", icon: Wallet },
      ],
    },
    {
      label: "Purchases",
      items: [
        { href: "/accounts/suppliers", label: "Suppliers", icon: Truck },
        { href: "/accounts/bills", label: "Bills", icon: ReceiptText, badge: "billsDue" },
        { href: "/accounts/expenses", label: "Expenses", icon: HandCoins },
        { href: "/accounts/payments-made", label: "Payments made", icon: Wallet },
      ],
    },
    {
      label: "Reports",
      items: [{ href: "/accounts/reports", label: "Reports", icon: BarChart3 }],
    },
  ],
  admin: [
    {
      label: "Team",
      items: [
        { href: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
        { href: "/admin/users", label: "Users", icon: Users },
      ],
    },
    {
      label: "System",
      items: [
        { href: "/admin/ai", label: "AI & feeds", icon: Bot, badge: "queue" },
        { href: "/admin/settings", label: "Settings", icon: SlidersHorizontal },
        { href: "/admin/errors", label: "Errors", icon: TriangleAlert },
      ],
    },
  ],
};

/** The sidebar groups of an app. */
export function navFor(app: AppKey): NavGroup[] {
  return APP_NAV[app] ?? [];
}

/** Hover text for a sidebar badge. */
export const BADGE_LABELS: Record<string, string> = {
  review: "waiting for review",
  alerts: "new this week",
  queue: "price lists waiting for AI",
  overdue: "invoices overdue",
  toInvoice: "delivered sales orders waiting for an invoice",
  billsDue: "supplier bills due this week or overdue",
  // Projects
  projOverdue: "projects with an overdue task",
};

/** Pages offered in the Ctrl K "Go to" list, for the apps the user may open. */
export function searchPages(apps: readonly AppKey[]) {
  return apps.flatMap((key) => navFor(key).flatMap((g) => g.items.map((i) => ({ ...i, app: key }))));
}
