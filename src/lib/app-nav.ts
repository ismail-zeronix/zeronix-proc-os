import { Bell, FolderKanban, Bot, Building2, ClipboardList, Landmark, Wallet, UsersRound, ClipboardPaste, FileText, History, Kanban, LayoutDashboard, PlusCircle, Search, SlidersHorizontal, Truck, Users, type LucideIcon } from "lucide-react";
import type { AppKey } from "./apps";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Name of a number in the `badges` map handed to the sidebar. */
  badge?: string;
  /** Match only this exact path (for an app's overview page). */
  exact?: boolean;
  /** Other paths whose pages (`/sales/deals/12`) belong to this item, so it stays lit there. */
  also?: string[];
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/** Sidebar pages per app. Apps without an entry have no sidebar (single-page apps). */
export const APP_NAV: Partial<Record<AppKey, NavGroup[]>> = {
  sales: [
    {
      label: "Work",
      items: [
        { href: "/sales", label: "Overview", icon: LayoutDashboard, exact: true },
        { href: "/sales/pipeline", label: "Pipeline", icon: Kanban, also: ["/sales/deals"] },
        { href: "/sales/quotes", label: "Quotes", icon: FileText },
        { href: "/sales/orders", label: "Orders", icon: ClipboardList },
        { href: "/sales/new", label: "New deal", icon: PlusCircle },
      ],
    },
    {
      label: "Customers",
      items: [
        { href: "/sales/companies", label: "Companies", icon: Building2 },
        { href: "/sales/contacts", label: "Contacts", icon: Users },
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
        { href: "/procurement/import", label: "Paste price list", icon: ClipboardPaste, exact: true },
      ],
    },
    {
      label: "Track",
      items: [
        { href: "/procurement/alerts", label: "Price alerts", icon: Bell, badge: "alerts" },
        { href: "/procurement/price-lists", label: "Price lists", icon: History, badge: "review", also: ["/procurement/import"] },
        { href: "/procurement/suppliers", label: "Suppliers", icon: Truck },
      ],
    },
  ],
  accounts: [
    {
      label: "Money",
      items: [
        { href: "/accounts", label: "Overview", icon: LayoutDashboard, exact: true },
        { href: "/accounts/invoices", label: "Invoices", icon: FileText, badge: "overdue" },
        { href: "/accounts/payments", label: "Payments", icon: Wallet },
        { href: "/accounts/customers", label: "Customers", icon: UsersRound },
      ],
    },
    {
      label: "Orders",
      items: [{ href: "/accounts/to-invoice", label: "To invoice", icon: Landmark, badge: "toInvoice" }],
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
      ],
    },
  ],
};

/** Hover text for a sidebar badge. */
export const BADGE_LABELS: Record<string, string> = {
  review: "waiting for review",
  alerts: "new this week",
  queue: "price lists waiting for AI",
  overdue: "invoices overdue",
  toInvoice: "delivered orders waiting for an invoice",
  // Projects
  projOverdue: "projects with an overdue task",
};

/** Pages offered in the Ctrl K "Go to" list, for the apps the user may open. */
export function searchPages(apps: readonly AppKey[]) {
  return apps.flatMap((key) => (APP_NAV[key] ?? []).flatMap((g) => g.items.map((i) => ({ ...i, app: key }))));
}
